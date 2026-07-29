import { useCallback, useEffect, useRef, useState } from "react";
import roomBg from "../imports/Gemini_Generated_Image_kvcpatkvcpatkvcp.png";
import { ImageWithFallback } from "./components/figma/ImageWithFallback";
import { useExternalScripts } from "./components/use-scripts";
import { AudioEngine, defaultSettings, type PlayerSettings } from "./components/audio-engine";
import { drawScene, initMist, type HeartEnergy } from "./components/fractal-heart";
import {
  BONES, LM, chordDisplayName, checkHarmony, detectPointing, detectRootGesture,
  voiceBlockChord, buildArpPool, type Landmark, type Handedness,
} from "./components/gesture";
import {
  HudPanel, ModeSelector, OrbitalPanel, RootPanel, SoundControls, StartOverlay,
  P1_COLOR, P2_COLOR, type PlayerUI,
} from "./components/ui-panels";

const DEBOUNCE_ROOT_MS = 180;
const DEBOUNCE_QUALITY_MS = 120;

interface PlayerRuntime {
  lastRawRoot: string | null; rootSince: number; stableRoot: string | null;
  lastRawQuality: string | null; qualitySince: number; stableQuality: string;
  prevChordKey: string | null;
}
const newRuntime = (): PlayerRuntime => ({
  lastRawRoot: null, rootSince: 0, stableRoot: null,
  lastRawQuality: null, qualitySince: 0, stableQuality: "Major",
  prevChordKey: null,
});

export default function App() {
  const { ready, error } = useExternalScripts();

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<AudioEngine | null>(null);
  const handsRef = useRef<any>(null);
  const rafRef = useRef<number>(0);
  const camLoopRef = useRef<number>(0);
  const prevHarmonyRef = useRef<string | null>(null);

  const p1Rt = useRef<PlayerRuntime>(newRuntime());
  const p2Rt = useRef<PlayerRuntime>(newRuntime());
  const energyRef = useRef<HeartEnergy>({ p1: 0, p2: 0, pulse: 0 });

  const orbital1Ref = useRef<HTMLDivElement | null>(null);
  const orbital2Ref = useRef<HTMLDivElement | null>(null);

  const [started, setStarted] = useState(false);
  const [noCam, setNoCam] = useState(false);
  const [mode, setMode] = useState<"single" | "duo">("single");
  const [tab, setTab] = useState<1 | 2>(1);
  const [p1Settings, setP1Settings] = useState<PlayerSettings>(defaultSettings());
  const [p2Settings, setP2Settings] = useState<PlayerSettings>(defaultSettings());
  const [reverb, setReverb] = useState(30);
  const [master, setMaster] = useState(-6);

  const [p1UI, setP1UI] = useState<PlayerUI>({ root: null, quality: "Major", chord: "—", present: false });
  const [p2UI, setP2UI] = useState<PlayerUI>({ root: null, quality: "Major", chord: "—", present: false });
  const [harmony, setHarmony] = useState<string | null>(null);
  const [score, setScore] = useState({ p1: 0, p2: 0, together: 0 });

  const modeRef = useRef(mode);
  useEffect(() => { modeRef.current = mode; }, [mode]);

  // Keep audio engine in sync with settings
  useEffect(() => { engineRef.current?.p1?.applySettings(p1Settings); }, [p1Settings]);
  useEffect(() => { engineRef.current?.p2?.applySettings(p2Settings); }, [p2Settings]);
  useEffect(() => { engineRef.current?.setReverb(reverb / 100); }, [reverb]);
  useEffect(() => { engineRef.current?.setMaster(master); }, [master]);
  useEffect(() => { if (mode === "single") setTab(1); }, [mode]);

  const getOrbitalNodes = (player: 1 | 2) => {
    const el = player === 1 ? orbital1Ref.current : orbital2Ref.current;
    if (!el) return [];
    return Array.from(el.querySelectorAll<HTMLElement>("[data-quality]")).map((n) => {
      const r = n.getBoundingClientRect();
      return { quality: n.dataset.quality!, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
    });
  };

  const onResults = useCallback((results: any) => {
    const canvas = canvasRef.current;
    const engine = engineRef.current;
    if (!canvas || !engine) return;
    const ctx = canvas.getContext("2d")!;
    const now = performance.now();
    const w = canvas.width, h = canvas.height;
    const curMode = modeRef.current;

    // Partition hands (mirrored: x>=0.5 is screen-left → Player 1)
    const p1Hands: { lm: Landmark[]; info: Handedness }[] = [];
    const p2Hands: { lm: Landmark[]; info: Handedness }[] = [];
    if (results.multiHandLandmarks && results.multiHandedness) {
      results.multiHandLandmarks.forEach((lm: Landmark[], i: number) => {
        const info = results.multiHandedness[i] as Handedness;
        if (curMode === "single") p1Hands.push({ lm, info });
        else if (lm[0].x >= 0.5) p1Hands.push({ lm, info });
        else p2Hands.push({ lm, info });
      });
    }

    const process = (hands: typeof p1Hands, rt: PlayerRuntime, player: 1 | 2) => {
      let rawRoot: string | null = null;
      let rawQuality: string | null = null;
      let pointer: Landmark[] | null = null;
      const nodes = getOrbitalNodes(player);
      for (const { lm, info } of hands) {
        if (info.label === "Right") rawRoot = detectRootGesture(lm, "Left");
        else if (info.label === "Left") {
          rawQuality = detectPointing(lm, nodes, w, h);
          if (rawQuality) pointer = lm;
        }
      }
      if (rawRoot !== rt.lastRawRoot) { rt.lastRawRoot = rawRoot; rt.rootSince = now; }
      if (now - rt.rootSince >= DEBOUNCE_ROOT_MS) rt.stableRoot = rawRoot;
      if (rawQuality !== null) {
        if (rawQuality !== rt.lastRawQuality) { rt.lastRawQuality = rawQuality; rt.qualitySince = now; }
        if (now - rt.qualitySince >= DEBOUNCE_QUALITY_MS) rt.stableQuality = rawQuality;
      }
      return { present: hands.length > 0, pointer };
    };

    const r1 = process(p1Hands, p1Rt.current, 1);
    const r2 = curMode === "duo" ? process(p2Hands, p2Rt.current, 2) : { present: false, pointer: null };

    if (curMode === "single") {
      engine.p2?.releaseAll();
      p2Rt.current.stableRoot = null;
      p2Rt.current.prevChordKey = null;
    }

    // Trigger audio when a player's chord changes
    const triggerFor = (rt: PlayerRuntime, voice: any) => {
      const key = `${rt.stableRoot}_${rt.stableQuality}`;
      if (key !== rt.prevChordKey) {
        rt.prevChordKey = key;
        voice?.play(voiceBlockChord(rt.stableRoot, rt.stableQuality), buildArpPool(rt.stableRoot, rt.stableQuality));
        return !!rt.stableRoot && rt.stableRoot !== "Stop";
      }
      return false;
    };
    const p1Fired = triggerFor(p1Rt.current, engine.p1);
    const p2Fired = curMode === "duo" ? triggerFor(p2Rt.current, engine.p2) : false;
    if (p1Fired || p2Fired) {
      energyRef.current.pulse = 1;
      setScore((s) => ({ ...s, p1: s.p1 + (p1Fired ? 1 : 0), p2: s.p2 + (p2Fired ? 1 : 0) }));
    }

    // Chord names + harmony
    const c1 = chordDisplayName(p1Rt.current.stableRoot, p1Rt.current.stableQuality);
    const c2 = curMode === "duo" ? chordDisplayName(p2Rt.current.stableRoot, p2Rt.current.stableQuality) : "—";
    const harm = curMode === "duo" ? checkHarmony(c1, c2) : null;

    // Energy driving the heart
    const e = energyRef.current;
    const target1 = r1.present && p1Rt.current.stableRoot && p1Rt.current.stableRoot !== "Stop" ? 1 : 0;
    const target2 = r2.present && p2Rt.current.stableRoot && p2Rt.current.stableRoot !== "Stop" ? 1 : 0;
    e.p1 += (target1 - e.p1) * 0.08;
    e.p2 += (target2 - e.p2) * 0.08;
    e.pulse *= 0.92;

    // Draw everything
    ctx.clearRect(0, 0, w, h);
    drawScene(ctx, w, h, now / 1000, e);
    for (const { lm } of [...p1Hands, ...(curMode === "duo" ? p2Hands : [])]) drawSkeleton(ctx, lm, w, h);
    if (r1.pointer) drawPointer(ctx, r1.pointer, w, h, P1_COLOR);
    if (r2.pointer) drawPointer(ctx, r2.pointer, w, h, P2_COLOR);

    // Push UI state (only when it changes)
    setP1UI((prev) => {
      const next: PlayerUI = { root: p1Rt.current.stableRoot, quality: p1Rt.current.stableQuality, chord: c1, present: r1.present };
      return prev.root === next.root && prev.quality === next.quality && prev.chord === next.chord && prev.present === next.present ? prev : next;
    });
    setP2UI((prev) => {
      const next: PlayerUI = { root: p2Rt.current.stableRoot, quality: p2Rt.current.stableQuality, chord: c2, present: r2.present };
      return prev.root === next.root && prev.quality === next.quality && prev.chord === next.chord && prev.present === next.present ? prev : next;
    });
    setHarmony((prev) => (prev === harm ? prev : harm));
    if (harm && harm !== prevHarmonyRef.current) setScore((s) => ({ ...s, together: s.together + 1 }));
    prevHarmonyRef.current = harm;
  }, []);

  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    initMist(canvas.width, canvas.height);
  }, []);

  useEffect(() => {
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [resize]);

  // Animation loop for when the camera isn't driving the canvas:
  // before Start (idle) and in ambient/no-camera mode (mouse-driven).
  useEffect(() => {
    if (started && !noCam) return;
    let raf = 0;
    const loop = () => {
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d")!;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const e = energyRef.current;
        if (noCam) {
          // Ease toward mouse-driven targets set on pointer move
          e.p1 += (ambientRef.current.p1 - e.p1) * 0.06;
          e.p2 += (ambientRef.current.p2 - e.p2) * 0.06;
        } else {
          e.p1 += (0.35 - e.p1) * 0.02;
          e.p2 += (0.35 - e.p2) * 0.02;
        }
        e.pulse *= 0.94;
        drawScene(ctx, canvas.width, canvas.height, performance.now() / 1000, e);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    rafRef.current = raf;
    return () => cancelAnimationFrame(raf);
  }, [started, noCam]);

  // Ambient (no-camera) mouse interaction: left = cyan, right = pink.
  const ambientRef = useRef({ p1: 0.4, p2: 0.4 });
  useEffect(() => {
    if (!noCam) return;
    const onMove = (ev: PointerEvent) => {
      const x = ev.clientX / window.innerWidth;
      ambientRef.current.p1 = 1 - x;
      ambientRef.current.p2 = x;
    };
    const onDown = () => { energyRef.current.pulse = 1; };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [noCam]);

  const handleStart = async () => {
    if (!ready || !videoRef.current) return;

    // Audio must always start (requires the user gesture we already have)
    try {
      const engine = new AudioEngine();
      await engine.start(p1Settings, p2Settings, reverb / 100, master);
      engineRef.current = engine;
    } catch (e: any) {
      alert(`Could not start audio: ${e?.message ?? e}`);
      return;
    }

    // Camera is best-effort. Probe access ourselves first so that when it's
    // blocked (sandboxed preview / denied permission) we quietly enter ambient
    // mode instead of letting MediaPipe's camera helper log an error.
    let stream: MediaStream | null = null;
    if (navigator.mediaDevices?.getUserMedia) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } });
      } catch {
        stream = null;
      }
    }

    if (!stream) {
      setNoCam(true);
      setStarted(true); // ambient animation loop keeps the heart alive
      return;
    }

    try {
      const hands = new window.Hands({
        locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
      });
      hands.setOptions({ maxNumHands: 4, modelComplexity: 1, minDetectionConfidence: 0.6, minTrackingConfidence: 0.6 });
      hands.onResults(onResults);
      handsRef.current = hands;

      const video = videoRef.current;
      video.srcObject = stream;
      await video.play();

      // Manual pump loop feeding frames to MediaPipe (avoids camera_utils).
      const pump = async () => {
        if (video.readyState >= 2 && handsRef.current) {
          try { await handsRef.current.send({ image: video }); } catch { /* frame skipped */ }
        }
        camLoopRef.current = requestAnimationFrame(pump);
      };
      cancelAnimationFrame(rafRef.current);
      camLoopRef.current = requestAnimationFrame(pump);
      setStarted(true);
    } catch (e: any) {
      stream.getTracks().forEach((t) => t.stop());
      setNoCam(true);
      setStarted(true);
    }
  };

  const patchSettings = (patch: Partial<PlayerSettings>) => {
    if (tab === 1) setP1Settings((s) => ({ ...s, ...patch }));
    else setP2Settings((s) => ({ ...s, ...patch }));
  };

  return (
    <div className="fixed inset-0 overflow-hidden" style={{ background: "#07060c" }}>
      {/* Living-room backdrop */}
      <ImageWithFallback
        src={roomBg}
        alt="Dimly lit living room with a framed painting"
        className="absolute inset-0 w-full h-full object-cover"
        style={{ filter: "brightness(0.45) saturate(0.9)" }}
      />
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at center, rgba(7,6,12,0.35) 0%, rgba(7,6,12,0.8) 100%)" }} />

      {/* Heart / effects canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      <video ref={videoRef} playsInline className="hidden" />

      {/* UI */}
      {started && (
        <>
          {noCam && (
            <div
              className="fixed top-[70px] left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded-full text-center"
              style={{ background: "rgba(18,18,24,0.75)", border: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(10px)", fontSize: 12, color: "rgba(255,255,255,0.7)", maxWidth: "90vw" }}
            >
              📷 Camera unavailable — ambient mode. Move your mouse (left = cyan, right = pink) · click to pulse the heart.
            </div>
          )}
          <ModeSelector mode={mode} onMode={setMode} />
          <RootPanel player={1} activeRoot={p1UI.root} side="left" />
          <OrbitalPanel
            player={1}
            activeQuality={p1UI.quality}
            containerRef={(el) => { orbital1Ref.current = el; }}
            style={{ left: mode === "single" ? "calc(100vw - 280px)" : "calc(25vw - 120px)" }}
          />
          <HudPanel player={1} ui={p1UI} />

          {mode === "duo" && (
            <>
              <RootPanel player={2} activeRoot={p2UI.root} side="right" />
              <OrbitalPanel
                player={2}
                activeQuality={p2UI.quality}
                containerRef={(el) => { orbital2Ref.current = el; }}
                style={{ left: "calc(75vw - 120px)" }}
              />
              <HudPanel player={2} ui={p2UI} />
            </>
          )}

          {/* Big chord labels */}
          <div className="fixed bottom-[85px] left-20 pointer-events-none" style={{ fontSize: 64, fontWeight: 700, color: P1_COLOR, textShadow: `0 0 25px ${P1_COLOR}73` }}>
            {p1UI.chord}
          </div>
          {mode === "duo" && (
            <div className="fixed bottom-[85px] right-20 pointer-events-none" style={{ fontSize: 64, fontWeight: 700, color: P2_COLOR, textShadow: `0 0 25px ${P2_COLOR}73` }}>
              {p2UI.chord}
            </div>
          )}
          {harmony && (
            <div className="fixed bottom-[95px] left-1/2 -translate-x-1/2 pointer-events-none z-[15]" style={{ fontSize: 28, fontWeight: 600, color: "#fff", textShadow: "0 0 15px rgba(255,255,255,0.8), 0 0 30px rgba(210,180,255,0.5)" }}>
              {harmony}
            </div>
          )}

          {/* Scoreboard */}
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-10 uppercase px-4 py-1.5 rounded-full" style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1, color: "rgba(255,255,255,0.45)", background: "rgba(18,18,24,0.6)", border: "1px solid rgba(255,255,255,0.06)", backdropFilter: "blur(8px)" }}>
            {mode === "duo"
              ? `💗 P1: ${score.p1}  ·  P2: ${score.p2}  ·  Harmonies: ${score.together}`
              : `💗 Chords Triggered: ${score.p1}`}
          </div>

          <SoundControls
            mode={mode}
            tab={tab}
            onTab={setTab}
            settings={tab === 1 ? p1Settings : p2Settings}
            onChange={patchSettings}
            reverb={reverb}
            onReverb={setReverb}
            master={master}
            onMaster={setMaster}
          />
        </>
      )}

      {!started && <StartOverlay loading={!ready} error={error} onStart={handleStart} />}
    </div>
  );
}

// ---- Canvas overlays for hands ----
function scr(x: number, y: number, w: number, h: number): [number, number] {
  return [(1 - x) * w, y * h];
}

function drawSkeleton(ctx: CanvasRenderingContext2D, lm: Landmark[], w: number, h: number) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.lineWidth = 1.5;
  for (const [a, b] of BONES) {
    const [ax, ay] = scr(lm[a].x, lm[a].y, w, h);
    const [bx, by] = scr(lm[b].x, lm[b].y, w, h);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  for (const p of lm) {
    const [px, py] = scr(p.x, p.y, w, h);
    ctx.beginPath();
    ctx.arc(px, py, 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawPointer(ctx: CanvasRenderingContext2D, lm: Landmark[], w: number, h: number, color: string) {
  const [px, py] = scr(lm[LM.INDEX_TIP].x, lm[LM.INDEX_TIP].y, w, h);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.shadowBlur = 20;
  ctx.shadowColor = color;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(px, py, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
