import { ROOT_GESTURES, QUALITY_NODES } from "./gesture";
import type { PlayerSettings, Timbre } from "./audio-engine";

export const P1_COLOR = "#00ffc4";
export const P2_COLOR = "#ff5abe";

export interface PlayerUI {
  root: string | null;
  quality: string;
  chord: string;
  present: boolean;
}

// ---------------- Start overlay ----------------
export function StartOverlay({ loading, error, onStart }: { loading: boolean; error: string | null; onStart: () => void }) {
  return (
    <div
      onClick={!loading && !error ? onStart : undefined}
      className="fixed inset-0 z-[100] flex items-center justify-center cursor-pointer select-none"
      style={{ background: "rgba(5,5,12,0.9)", backdropFilter: "blur(24px)" }}
    >
      <div className="text-center px-6">
        <div className="mb-4" style={{ fontSize: 52 }}>💗</div>
        <h1
          className="mb-2"
          style={{
            fontSize: 34,
            fontWeight: 700,
            background: "linear-gradient(135deg,#fff, #00ffc4 45%, #ff5abe)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          Gesture Symphony
        </h1>
        <p style={{ letterSpacing: 2, textTransform: "uppercase", color: "rgba(255,255,255,0.5)", fontSize: 13 }}>
          {error ? error : loading ? "Loading engine…" : "Tap anywhere to begin"}
        </p>
        {!loading && !error && (
          <p className="mt-4" style={{ color: "rgba(255,255,255,0.35)", fontSize: 12 }}>
            Allow camera access · shape chords with your hands
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------- Mode selector ----------------
export function ModeSelector({ mode, onMode }: { mode: "single" | "duo"; onMode: (m: "single" | "duo") => void }) {
  const base =
    "px-4 py-2 rounded-[14px] cursor-pointer transition-all border-none bg-transparent uppercase tracking-[1.5px]";
  return (
    <div
      className="fixed top-4 left-1/2 -translate-x-1/2 z-30 flex gap-2 p-1.5 rounded-[20px]"
      style={{ background: "rgba(14,14,22,0.72)", backdropFilter: "blur(16px)", border: "1px solid rgba(255,255,255,0.06)" }}
    >
      <button
        className={base}
        onClick={() => onMode("single")}
        style={{
          fontSize: 11, fontWeight: 600,
          color: mode === "single" ? P1_COLOR : "rgba(255,255,255,0.5)",
          background: mode === "single" ? "rgba(255,255,255,0.08)" : "transparent",
          boxShadow: mode === "single" ? `0 0 12px ${P1_COLOR}40` : "none",
        }}
      >
        Single Player
      </button>
      <button
        className={base}
        onClick={() => onMode("duo")}
        style={{
          fontSize: 11, fontWeight: 600,
          color: mode === "duo" ? P2_COLOR : "rgba(255,255,255,0.5)",
          background: mode === "duo" ? "rgba(255,255,255,0.08)" : "transparent",
          boxShadow: mode === "duo" ? `0 0 12px ${P2_COLOR}40` : "none",
        }}
      >
        Collaborative Duo
      </button>
    </div>
  );
}

// ---------------- Root-note cards (left) ----------------
export function RootPanel({ player, activeRoot, side }: { player: 1 | 2; activeRoot: string | null; side: "left" | "right" }) {
  const color = player === 1 ? P1_COLOR : P2_COLOR;
  return (
    <div
      className="fixed top-[52%] -translate-y-1/2 z-10 flex flex-col items-center"
      style={{ [side]: 16 } as any}
    >
      <div className="mb-2 uppercase text-center" style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: `${color}bf` }}>
        P{player} Root Note
      </div>
      <div className="flex flex-col gap-1">
        {ROOT_GESTURES.map((g) => {
          const active = activeRoot === g.note;
          return (
            <div
              key={g.note}
              className="flex items-center gap-2.5 px-3.5 py-2 rounded-[10px] transition-all"
              style={{
                minWidth: 120,
                background: active ? `${color}1f` : "rgba(18,18,24,0.65)",
                backdropFilter: "blur(12px)",
                border: `1px solid ${active ? color : g.stop ? "rgba(200,60,60,0.15)" : "rgba(255,255,255,0.06)"}`,
                boxShadow: active ? `0 0 16px ${color}40` : "none",
                transform: active ? "scale(1.03)" : "none",
              }}
            >
              <span style={{ fontSize: 18 }}>{g.emoji}</span>
              <span
                style={{
                  fontSize: 12, fontWeight: 600,
                  color: active ? color : g.stop ? "rgba(255,120,120,0.55)" : "rgba(255,255,255,0.45)",
                  textShadow: active ? `0 0 8px ${color}80` : "none",
                }}
              >
                {g.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------- Orbital chord-quality selector (right) ----------------
export function OrbitalPanel({
  player,
  activeQuality,
  containerRef,
  style,
}: {
  player: 1 | 2;
  activeQuality: string;
  containerRef: (el: HTMLDivElement | null) => void;
  style: React.CSSProperties;
}) {
  const color = player === 1 ? P1_COLOR : P2_COLOR;
  return (
    <div className="fixed top-[52%] -translate-y-1/2 z-10 flex flex-col items-center" style={style}>
      <div className="mb-2 uppercase text-center" style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: `${color}bf` }}>
        P{player} Chord Type
      </div>
      <div ref={containerRef} className="relative" style={{ width: 240, height: 240 }} data-orbital={player}>
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full flex items-center justify-center"
          style={{
            width: 56, height: 56, border: "1.5px solid rgba(255,255,255,0.07)",
            background: "rgba(18,18,24,0.4)", backdropFilter: "blur(8px)",
            fontSize: 9, color: "rgba(255,255,255,0.22)", letterSpacing: 1,
          }}
        >
          pick
        </div>
        {QUALITY_NODES.map((n) => {
          const active = activeQuality === n.quality;
          const radius = 95;
          const transform = `translate(-50%,-50%) rotate(${n.angle}deg) translateY(${-radius}px) rotate(${-n.angle}deg)${active ? " scale(1.12)" : ""}`;
          return (
            <div
              key={n.quality}
              data-quality={n.quality}
              className="absolute top-1/2 left-1/2 rounded-full flex flex-col items-center justify-center transition-all"
              style={{
                width: 50, height: 50, transform,
                background: active ? `${color}26` : "rgba(22,22,30,0.6)",
                backdropFilter: "blur(8px)",
                border: `1px solid ${active ? color : "rgba(255,255,255,0.06)"}`,
                boxShadow: active ? `0 0 16px ${color}4d, 0 0 32px ${color}26` : "none",
              }}
            >
              <span style={{ fontSize: 15 }}>{n.emoji}</span>
              <span style={{ fontSize: 8, fontWeight: 600, color: "rgba(255,255,255,0.7)", marginTop: 1 }}>{n.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------- HUD panel ----------------
export function HudPanel({ player, ui }: { player: 1 | 2; ui: PlayerUI }) {
  const color = player === 1 ? P1_COLOR : P2_COLOR;
  const side = player === 1 ? "left" : "right";
  return (
    <div
      className="fixed top-[70px] z-10 px-[18px] py-3 rounded-xl"
      style={{
        [side]: 20,
        minWidth: 220,
        textAlign: player === 1 ? "left" : "right",
        background: "rgba(18,18,24,0.65)",
        border: "1px solid rgba(255,255,255,0.06)",
        [`border${player === 1 ? "Left" : "Right"}`]: `4px solid ${color}`,
        backdropFilter: "blur(12px)",
      } as any}
    >
      <div className="uppercase" style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>
        Player {player}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color, textShadow: `0 0 10px ${color}4d`, marginBottom: 8 }}>{ui.chord}</div>
      <div className="w-full overflow-hidden rounded" style={{ height: 6, background: "rgba(255,255,255,0.08)", marginBottom: 6 }}>
        <div style={{ height: "100%", width: ui.present ? "100%" : "0%", background: color, transition: "width 0.1s", float: player === 2 ? "right" : "none" }} />
      </div>
      <div style={{ fontSize: 11, fontFamily: "monospace", color: "rgba(255,255,255,0.5)" }}>
        Root: {ui.root ?? "—"} | {ui.quality}
      </div>
    </div>
  );
}

// ---------------- Sound controls ----------------
const TIMBRES: { id: Timbre; name: string; sub: string }[] = [
  { id: "synth", name: "Synth Keys", sub: "FM · smooth" },
  { id: "strings", name: "Strings", sub: "saw pad" },
  { id: "woodwind", name: "Woodwind", sub: "soft tri" },
];

export function SoundControls({
  mode,
  tab,
  onTab,
  settings,
  onChange,
  reverb,
  onReverb,
  master,
  onMaster,
}: {
  mode: "single" | "duo";
  tab: 1 | 2;
  onTab: (t: 1 | 2) => void;
  settings: PlayerSettings;
  onChange: (patch: Partial<PlayerSettings>) => void;
  reverb: number;
  onReverb: (v: number) => void;
  master: number;
  onMaster: (v: number) => void;
}) {
  const accent = tab === 1 ? P1_COLOR : P2_COLOR;
  const range = (val: number, min: number, max: number, step: number, on: (v: number) => void) => (
    <input
      type="range" min={min} max={max} step={step} value={val}
      onChange={(e) => on(parseFloat(e.target.value))}
      className="w-full cursor-pointer"
      style={{ accentColor: accent }}
    />
  );

  return (
    <div
      className="fixed bottom-4 left-5 z-20 rounded-2xl overflow-hidden hidden md:block"
      style={{ width: 420, maxWidth: "calc(100vw - 360px)", background: "rgba(14,14,22,0.85)", backdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.06)" }}
    >
      <div className="px-4 py-2.5 uppercase" style={{ fontSize: 12, fontWeight: 600, letterSpacing: 2, color: "rgba(255,255,255,0.6)", background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        Sound Controls
      </div>
      {mode === "duo" && (
        <div className="flex" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
          {[1, 2].map((p) => (
            <button
              key={p}
              onClick={() => onTab(p as 1 | 2)}
              className="flex-1 py-2.5 uppercase bg-transparent border-none cursor-pointer"
              style={{
                fontSize: 11, fontWeight: 600, letterSpacing: 1.5,
                color: tab === p ? "#fff" : "rgba(255,255,255,0.45)",
                borderBottom: `2px solid ${tab === p ? (p === 1 ? P1_COLOR : P2_COLOR) : "transparent"}`,
              }}
            >
              P{p} Settings
            </button>
          ))}
        </div>
      )}
      <div className="p-4 flex flex-col gap-3.5">
        <div>
          <div className="uppercase mb-2" style={{ fontSize: 10, fontWeight: 600, letterSpacing: 1.5, color: "rgba(255,255,255,0.3)" }}>Timbre</div>
          <div className="flex gap-2">
            {TIMBRES.map((t) => {
              const active = settings.timbre === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => onChange({ timbre: t.id })}
                  className="flex-1 px-2.5 py-2 rounded-[10px] cursor-pointer border"
                  style={{
                    background: active ? `${accent}30` : "rgba(30,30,40,0.6)",
                    borderColor: active ? accent : "rgba(255,255,255,0.06)",
                    color: active ? "#fff" : "rgba(255,255,255,0.45)",
                    fontSize: 11, fontWeight: 600, lineHeight: 1.3,
                  }}
                >
                  {t.name}
                  <br />
                  <small style={{ fontSize: 9, opacity: 0.6, fontWeight: 400 }}>{t.sub}</small>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="uppercase mb-2" style={{ fontSize: 10, fontWeight: 600, letterSpacing: 1.5, color: "rgba(255,255,255,0.3)" }}>Autoplay</div>
          <div className="flex gap-2">
            {[0, 1, 2, 3].map((lvl) => {
              const active = settings.autoplayLevel === lvl;
              return (
                <button
                  key={lvl}
                  onClick={() => onChange({ autoplayLevel: lvl })}
                  className="flex-1 py-2 rounded-[10px] cursor-pointer border"
                  style={{
                    background: active ? `${accent}30` : "rgba(30,30,40,0.6)",
                    borderColor: active ? accent : "rgba(255,255,255,0.06)",
                    color: active ? "#fff" : "rgba(255,255,255,0.45)",
                    fontSize: 11, fontWeight: 600,
                  }}
                >
                  Lv {lvl}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex gap-3">
          <label className="flex-1" style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>
            HP {Math.round(settings.hpFreq)}Hz
            {range(settings.hpFreq, 20, 2000, 1, (v) => onChange({ hpFreq: v }))}
          </label>
          <label className="flex-1" style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>
            LP {(settings.lpFreq / 1000).toFixed(1)}k
            {range(settings.lpFreq, 1000, 20000, 100, (v) => onChange({ lpFreq: v }))}
          </label>
        </div>

        <div className="flex gap-3">
          <label className="flex-1" style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>
            Reverb {reverb}%
            {range(reverb, 0, 100, 1, onReverb)}
          </label>
          <label className="flex-1" style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>
            Master {master}
            {range(master, -40, 0, 1, onMaster)}
          </label>
        </div>

        <div className="flex gap-3">
          <label className="flex-1" style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>
            Attack {settings.attack.toFixed(2)}s
            {range(settings.attack, 0.005, 2, 0.005, (v) => onChange({ attack: v }))}
          </label>
          <label className="flex-1" style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>
            Release {settings.release.toFixed(2)}s
            {range(settings.release, 0.05, 5, 0.05, (v) => onChange({ release: v }))}
          </label>
        </div>
      </div>
    </div>
  );
}
