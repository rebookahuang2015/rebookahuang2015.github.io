import { useState, useEffect, useRef, useCallback } from "react";

type TrailNote = { id: number; x: number; y: number; size: number; rot: number; glyph: number };
type Ripple = { id: number; x: number; y: number };

const NOTES = [
  { x: "38%", delay: "0s",   dur: "4.2s", rot: "-12deg", size: 18 },
  { x: "45%", delay: "1.1s", dur: "3.8s", rot: "6deg",   size: 14 },
  { x: "52%", delay: "2.3s", dur: "4.6s", rot: "-3deg",  size: 16 },
  { x: "41%", delay: "0.6s", dur: "5s",   rot: "15deg",  size: 12 },
  { x: "49%", delay: "1.8s", dur: "4s",   rot: "-8deg",  size: 20 },
];

function MusicalNote({ size, glyph = 0 }: { size: number; glyph?: number }) {
  if (glyph === 1) {
    // Single eighth note
    return (
      <svg width={size} height={size * 1.35} viewBox="0 0 18 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M6 18V4c3 0 6 1.5 8 4.5" stroke="#c9a84c" strokeWidth="1.4" strokeLinecap="round" fill="none" />
        <ellipse cx="4" cy="18.5" rx="4" ry="3" fill="#c9a84c" transform="rotate(-20 4 18.5)" />
      </svg>
    );
  }
  // Beamed pair
  return (
    <svg width={size} height={size * 1.2} viewBox="0 0 24 29" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M9 21V7l13-3v14"
        stroke="#c9a84c"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <circle cx="6" cy="21" r="3" fill="#c9a84c" />
      <circle cx="19" cy="18" r="3" fill="#c9a84c" />
    </svg>
  );
}

export default function App() {
  const [tapped, setTapped] = useState(false);
  const [showCursor, setShowCursor] = useState(true);
  const [trail, setTrail] = useState<TrailNote[]>([]);
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const [parallax, setParallax] = useState({ tx: 0, ty: 0, rx: 0, ry: 0 });
  const [nearTitle, setNearTitle] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSpawn = useRef({ x: 0, y: 0, t: 0 });
  const lastParallax = useRef(0);
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const idRef = useRef(0);

  useEffect(() => {
    intervalRef.current = setInterval(() => setShowCursor((v) => !v), 530);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const now = performance.now();

    // Cursor parallax + proximity — throttled independently of the note trail
    if (now - lastParallax.current > 40) {
      lastParallax.current = now;
      const nx = e.clientX / window.innerWidth - 0.5; // -0.5 .. 0.5
      const ny = e.clientY / window.innerHeight - 0.5;
      setParallax({
        tx: nx * 16,
        ty: ny * 16,
        ry: nx * 6,
        rx: -ny * 6,
      });

      const rect = titleRef.current?.getBoundingClientRect();
      if (rect) {
        const pad = 90;
        const inside =
          e.clientX >= rect.left - pad &&
          e.clientX <= rect.right + pad &&
          e.clientY >= rect.top - pad &&
          e.clientY <= rect.bottom + pad;
        setNearTitle(inside);
      }
    }

    // Note trail — only drop a note after some travel + time, for an elegant sparse trail
    const { x, y, t } = lastSpawn.current;
    const dist = Math.hypot(e.clientX - x, e.clientY - y);
    if (dist < 34 || now - t < 55) return;
    lastSpawn.current = { x: e.clientX, y: e.clientY, t: now };

    const id = idRef.current++;
    const note: TrailNote = {
      id,
      x: e.clientX,
      y: e.clientY,
      size: 12 + Math.random() * 12,
      rot: (Math.random() - 0.5) * 50,
      glyph: Math.random() > 0.5 ? 1 : 0,
    };
    setTrail((prev) => [...prev, note]);
    // Remove after the fade animation completes
    setTimeout(() => {
      setTrail((prev) => prev.filter((n) => n.id !== id));
    }, 1600);
  }, []);

  const handleClick = useCallback((e: React.MouseEvent) => {
    const id = idRef.current++;
    setRipples((prev) => [...prev, { id, x: e.clientX, y: e.clientY }]);
    setTimeout(() => {
      setRipples((prev) => prev.filter((r) => r.id !== id));
    }, 900);
    setTapped(true);
  }, []);

  return (
    <div
      className="relative w-full h-full overflow-hidden cursor-pointer select-none"
      style={{ background: "radial-gradient(ellipse 80% 60% at 50% 60%, #1a1508 0%, #0a0a0b 70%)" }}
      onClick={handleClick}
      onPointerMove={handlePointerMove}
      onPointerLeave={() => {
        setParallax({ tx: 0, ty: 0, rx: 0, ry: 0 });
        setNearTitle(false);
      }}
    >
      {/* Subtle vignette overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse 100% 100% at 50% 50%, transparent 30%, rgba(0,0,0,0.7) 100%)"
        }}
      />

      {/* Floating note particles */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {NOTES.map((n, i) => (
          <div
            key={i}
            className="absolute bottom-1/2 glow-pulse"
            style={{
              left: n.x,
              animationDelay: n.delay,
              animationDuration: n.dur,
              ["--rot" as string]: n.rot,
            }}
          >
            <div
              className="note-float"
              style={{
                animationDelay: n.delay,
                animationDuration: n.dur,
                ["--rot" as string]: n.rot,
                opacity: 0,
              }}
            >
              <MusicalNote size={n.size} />
            </div>
          </div>
        ))}
      </div>

      {/* Mouse trail of fading musical notes */}
      <div className="absolute inset-0 pointer-events-none z-20 overflow-hidden">
        {trail.map((n) => (
          <div
            key={n.id}
            className="absolute trail-note"
            style={{
              left: n.x,
              top: n.y,
              ["--rot" as string]: `${n.rot}deg`,
            }}
          >
            <MusicalNote size={n.size} glyph={n.glyph} />
          </div>
        ))}
      </div>

      {/* Tap ripples */}
      <div className="absolute inset-0 pointer-events-none z-30 overflow-hidden">
        {ripples.map((r) => (
          <span key={r.id} className="ripple" style={{ left: r.x, top: r.y }} />
        ))}
      </div>

      {/* Center content */}
      <div className="relative flex flex-col items-center justify-center h-full gap-0">

        {/* Title — intro fade / idle breath / cursor parallax / spring lift, layered */}
        <div className="fade-in-up" style={{ animationDelay: "0.35s", perspective: "900px" }}>
          <div className="title-float">
            <div
              className="title-parallax"
              style={{
                transform: `translate3d(${parallax.tx}px, ${parallax.ty}px, 0) rotateX(${parallax.rx}deg) rotateY(${parallax.ry}deg)`,
              }}
            >
        <h1
          ref={titleRef}
          className={`title-lift text-center${nearTitle ? " title-lift--active" : ""}`}
          style={{ lineHeight: 1 }}
        >
          <span
            className={`shimmer-text title-glow block${nearTitle ? " title-glow--active" : ""}`}
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "clamp(2.4rem, 8vw, 5.4rem)",
              fontWeight: 400,
              letterSpacing: "0.16em",
              textIndent: "0.16em",
              textTransform: "uppercase",
            }}
          >
            Gesture
          </span>
          <span
            className={`title-glow block${nearTitle ? " title-glow--active" : ""}`}
            style={{
              fontFamily: "var(--font-script)",
              fontWeight: 400,
              fontSize: "clamp(4rem, 14vw, 9rem)",
              lineHeight: 0.95,
              color: "#f3e6bb",
              WebkitTextFillColor: "#f3e6bb",
              marginTop: "0.08em",
            }}
          >
            Symphony
          </span>
        </h1>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div
          className="fade-in-up mt-8 mb-7 w-16 h-px line-reveal"
          style={{
            background: "linear-gradient(90deg, transparent, #c9a84c, transparent)",
            animationDelay: "0.6s",
          }}
        />

        {/* Subtitle */}
        <p
          className="fade-in-up text-center"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "clamp(0.66rem, 1.5vw, 0.8rem)",
            fontWeight: 400,
            letterSpacing: "0.34em",
            textIndent: "0.34em",
            color: "rgba(201,168,76,0.7)",
            textTransform: "uppercase",
            animationDelay: "0.75s",
          }}
        >
          {tapped ? (
            "Loading your symphony…"
          ) : (
            <>
              Tap anywhere to begin
              <span style={{ opacity: showCursor ? 1 : 0, marginLeft: 2 }}>_</span>
            </>
          )}
        </p>

        {/* Signature credit */}
        <div className="fade-in-up absolute bottom-[4.6rem] flex flex-col items-center gap-4" style={{ animationDelay: "1.15s" }}>
          <p
            className="text-center"
            style={{
              fontFamily: "var(--font-serif)",
              fontStyle: "italic",
              fontWeight: 400,
              fontSize: "clamp(0.85rem, 2vw, 1.05rem)",
              letterSpacing: "0.02em",
              color: "rgba(226,200,126,0.72)",
            }}
          >
            Made by Rebecca <span style={{ fontStyle: "normal", opacity: 0.6 }}>—</span> where movement becomes music
          </p>
        </div>

        {/* Bottom line ornament */}
        <div
          className="fade-in-up absolute bottom-10 flex items-center gap-3"
          style={{ animationDelay: "1s" }}
        >
          <div className="h-px w-12" style={{ background: "linear-gradient(90deg, transparent, rgba(201,168,76,0.3))" }} />
          <div className="w-1 h-1 rounded-full" style={{ background: "rgba(201,168,76,0.4)" }} />
          <div className="h-px w-12" style={{ background: "linear-gradient(90deg, rgba(201,168,76,0.3), transparent)" }} />
        </div>
      </div>
    </div>
  );
}
