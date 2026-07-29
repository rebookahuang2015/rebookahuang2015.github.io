import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { ChordGlyph } from "./components/chord-glyph";

const ROOT_NOTES = [
  { label: "C",       emoji: "🤌", hue: 145 },
  { label: "D",       emoji: "✌️",  hue: 210 },
  { label: "E",       emoji: "👌", hue: 40  },
  { label: "F",       emoji: "🤘", hue: 280 },
  { label: "G",       emoji: "🖐️",  hue: 185 },
  { label: "A",       emoji: "👍", hue: 55  },
  { label: "B",       emoji: "☝️",  hue: 340 },
  { label: "C (8va)", emoji: "🤙", hue: 120 },
];

const CHORD_TYPES = [
  { label: "Major",  emoji: "☀️",  angleDeg: 270, quality: "Bright & Full"     },
  { label: "Dom 7",  emoji: "⚡",  angleDeg: 315, quality: "Tense & Drive"      },
  { label: "Minor",  emoji: "🌧️",  angleDeg: 0,   quality: "Dark & Melancholic" },
  { label: "Min 7",  emoji: "🌊",  angleDeg: 45,  quality: "Cool & Floating"    },
  { label: "Dim",    emoji: "🌑",  angleDeg: 90,  quality: "Dissonant & Edge"   },
  { label: "Sus 4",  emoji: "⏳",  angleDeg: 135, quality: "Tension & Release"  },
  { label: "Sus 2",  emoji: "🍃",  angleDeg: 180, quality: "Airy & Suspended"   },
  { label: "Maj 7",  emoji: "🌙",  angleDeg: 225, quality: "Dreamy & Open"      },
];

export default function App() {
  const [selectedNote, setSelectedNote]   = useState("C");
  const [selectedChord, setSelectedChord] = useState("Major");
  const [animKey, setAnimKey] = useState(0);
  const [mouse, setMouse] = useState({ x: -100, y: -100 });
  const [mouseVisible, setMouseVisible] = useState(false);
  const [parallax, setParallax] = useState({ x: 0, y: 0 });

  const noteObj  = ROOT_NOTES.find((n) => n.label === selectedNote)!;
  const chordObj = CHORD_TYPES.find((c) => c.label === selectedChord)!;
  const accentHsl = `hsl(${noteObj.hue}, 60%, 68%)`;
  const accentAlpha = (a: number) => `hsla(${noteObj.hue}, 60%, 68%, ${a})`;
  const neonHsl = `hsl(${noteObj.hue}, 95%, 74%)`;

  const pickNote = (note: string) => {
    setSelectedNote(note);
    setAnimKey((k) => k + 1);
  };
  const pickChord = (chord: string) => {
    setSelectedChord(chord);
    setAnimKey((k) => k + 1);
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      setMouse({ x: e.clientX, y: e.clientY });
      setMouseVisible(true);
      const nx = e.clientX / window.innerWidth - 0.5;
      const ny = e.clientY / window.innerHeight - 0.5;
      setParallax({ x: nx * 36, y: ny * 36 });
    };
    const onLeave = () => setMouseVisible(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseleave", onLeave);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseleave", onLeave);
    };
  }, []);

  const ORBIT = 120;
  const BTN = 62;

  return (
    <div
      className="fixed inset-0 w-full h-full min-h-screen overflow-hidden select-none"
      style={{ fontFamily: "var(--font-sans)", background: "oklch(0.14 0.014 55)" }}
    >
      {/* ── Simulated camera-feed background ── */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0"
          style={{
            background: `
              radial-gradient(ellipse 80% 60% at 28% 38%, oklch(0.22 0.025 55) 0%, transparent 68%),
              radial-gradient(ellipse 60% 80% at 74% 62%, oklch(0.19 0.02 45) 0%, transparent 70%),
              oklch(0.14 0.014 55)
            `,
          }}
        />
        <div
          className="absolute rounded-full"
          style={{
            width: 620, height: 620, top: "50%", left: "50%",
            transform: "translate(-50%, -50%)",
            background: `radial-gradient(circle, ${accentAlpha(0.14)}, transparent 68%)`,
            filter: "blur(60px)",
            transition: "background 1.2s ease",
          }}
        />
        <div
          className="absolute rounded-full"
          style={{
            width: 300, height: 300, top: "12%", right: "16%",
            background: "radial-gradient(circle, oklch(0.4 0.04 210 / 0.12), transparent 70%)",
            filter: "blur(46px)",
          }}
        />
        <div
          className="absolute rounded-full"
          style={{
            width: 260, height: 260, bottom: "10%", left: "14%",
            background: "radial-gradient(circle, oklch(0.36 0.03 45 / 0.10), transparent 70%)",
            filter: "blur(42px)",
          }}
        />
      </div>

      {/* ── Cursor trail ── */}
      <div
        className="pointer-events-none fixed z-50 rounded-full"
        style={{
          width: 30, height: 30, left: mouse.x - 15, top: mouse.y - 15,
          border: `1.5px solid ${accentAlpha(0.5)}`,
          opacity: mouseVisible ? 1 : 0,
          transition: "left 0.10s ease, top 0.10s ease, border-color 1s ease, opacity 0.3s ease",
          boxShadow: `0 0 14px ${accentAlpha(0.25)}`,
        }}
      />
      <div
        className="pointer-events-none fixed z-50 rounded-full"
        style={{
          width: 6, height: 6, left: mouse.x - 3, top: mouse.y - 3,
          background: accentHsl,
          opacity: mouseVisible ? 0.8 : 0,
          transition: "left 0.03s ease, top 0.03s ease, background 1s ease, opacity 0.3s ease",
        }}
      />

      {/* ── Top bar ── */}
      <div className="absolute top-0 inset-x-0 z-10 flex items-center justify-center py-5">
        <div className="flex items-center gap-4">
          <div className="h-px w-12 bg-white/10" />
          <span
            className="text-[10px] tracking-[0.35em] uppercase"
            style={{ fontFamily: "var(--font-mono)", color: "oklch(0.6 0.02 55)" }}
          >
            AR Chord Player
          </span>
          <div className="h-px w-12 bg-white/10" />
        </div>
      </div>

      {/* ── Left Panel — Root Note ── */}
      <div className="absolute left-4 top-1/2 -translate-y-1/2 z-20 flex flex-col">
        <span
          className="mb-3 px-1 text-[9px] tracking-[0.28em] uppercase"
          style={{ fontFamily: "var(--font-mono)", color: accentHsl, opacity: 0.8, transition: "color 1s ease" }}
        >
          P1 Root Note
        </span>

        <div className="flex flex-col gap-1.5">
          {ROOT_NOTES.map((note) => {
            const active = selectedNote === note.label;
            return (
              <motion.button
                key={note.label}
                onClick={() => pickNote(note.label)}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.96 }}
                className="relative flex items-center gap-2.5 rounded-[14px] text-left cursor-pointer"
                style={{
                  padding: "9px 14px", minWidth: 122,
                  backdropFilter: "blur(14px) saturate(140%)",
                  background: active ? accentAlpha(0.16) : "rgba(255,255,255,0.055)",
                  border: `1px solid ${active ? accentAlpha(0.45) : "rgba(255,255,255,0.1)"}`,
                  boxShadow: active ? `0 0 18px ${accentAlpha(0.18)}` : "none",
                  transition: "background 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease",
                }}
              >
                <div
                  className="absolute left-0 top-1/2 -translate-y-1/2 rounded-full"
                  style={{
                    width: 3, height: active ? 24 : 0, background: accentHsl,
                    opacity: active ? 0.95 : 0,
                    transition: "height 0.3s ease, opacity 0.3s ease",
                  }}
                />
                <span className="text-sm leading-none">{note.emoji}</span>
                <span
                  style={{
                    fontFamily: "var(--font-mono)", fontSize: "0.74rem", letterSpacing: "0.08em",
                    color: active ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.5)",
                    transition: "color 0.3s ease",
                  }}
                >
                  {note.label}
                </span>
              </motion.button>
            );
          })}

          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.96 }}
            className="flex items-center gap-2.5 rounded-[14px] mt-1 cursor-pointer"
            style={{
              padding: "9px 14px", minWidth: 122, backdropFilter: "blur(14px)",
              background: "rgba(200, 70, 70, 0.12)", border: "1px solid rgba(210,90,90,0.28)",
            }}
          >
            <span className="text-sm leading-none">👊</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.74rem", letterSpacing: "0.08em", color: "rgba(235,120,120,0.85)" }}>
              Stop
            </span>
          </motion.button>
        </div>
      </div>

      {/* ── Centre — Glyph + Chord name ── */}
      <div className="absolute inset-0 flex flex-col items-center justify-center z-0 pointer-events-none">
        <div
          className="relative"
          style={{
            width: 360, height: 360,
            transform: `translate(${parallax.x}px, ${parallax.y}px)`,
            transition: "transform 0.5s cubic-bezier(0.22,1,0.36,1)",
          }}
        >
          <motion.div
            key={`bloom-${animKey}`}
            initial={{ scale: 0.5, opacity: 0.6 }}
            animate={{ scale: 1.5, opacity: 0 }}
            transition={{ duration: 1.6, ease: "easeOut" }}
            className="absolute inset-0 rounded-full"
            style={{ background: `radial-gradient(circle, ${accentAlpha(0.28)}, transparent 68%)` }}
          />
          <motion.div
            key={`entry-${animKey}`}
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            className="w-full h-full"
          >
            <motion.div
              animate={{ scale: [1, 1.035, 1] }}
              transition={{ duration: 4.5, ease: "easeInOut", repeat: Infinity }}
              className="w-full h-full"
            >
              <ChordGlyph chord={selectedChord} color={neonHsl} glowId={`glow-${animKey}`} />
            </motion.div>
          </motion.div>
        </div>

        <motion.div
          key={`name-${animKey}`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.12 }}
          className="mt-4 flex flex-col items-center gap-1.5"
        >
          <span
            className="text-xl tracking-widest"
            style={{ fontFamily: "var(--font-mono)", color: "rgba(255,255,255,0.92)", fontWeight: 300 }}
          >
            {selectedNote} {selectedChord}
          </span>
          <span
            className="text-[10px] tracking-[0.22em] uppercase"
            style={{ fontFamily: "var(--font-mono)", color: accentHsl, opacity: 0.75, transition: "color 1s ease" }}
          >
            {chordObj?.quality}
          </span>
        </motion.div>
      </div>

      {/* ── Right Panel — Chord Type (Radial) ── */}
      <div className="absolute right-6 top-1/2 -translate-y-1/2 z-20 flex flex-col items-end">
        <span
          className="mb-3 px-1 text-[9px] tracking-[0.28em] uppercase text-right"
          style={{ fontFamily: "var(--font-mono)", color: accentHsl, opacity: 0.8, transition: "color 1s ease" }}
        >
          P1 Chord Type
        </span>

        <div className="relative" style={{ width: ORBIT * 2 + BTN, height: ORBIT * 2 + BTN }}>
          {/* dashed orbit ring */}
          <div
            className="absolute rounded-full pointer-events-none"
            style={{
              width: ORBIT * 2, height: ORBIT * 2, top: "50%", left: "50%",
              transform: "translate(-50%, -50%)",
              border: "1px dashed rgba(255,255,255,0.1)",
            }}
          />
          {/* centre label */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div
              className="flex items-center justify-center rounded-full"
              style={{ width: 58, height: 58, border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.6rem", letterSpacing: "0.28em", color: "rgba(255,255,255,0.28)" }}>
                pick
              </span>
            </div>
          </div>

          {/* orbit buttons — each wrapped in a static positioning div so
              Motion's scale transform never clobbers the orbit placement */}
          {CHORD_TYPES.map((chord) => {
            const active = selectedChord === chord.label;
            const rad = (chord.angleDeg - 90) * (Math.PI / 180);
            const cx = ORBIT * Math.cos(rad);
            const cy = ORBIT * Math.sin(rad);
            return (
              <div
                key={chord.label}
                className="absolute"
                style={{
                  width: BTN, height: BTN,
                  left: `calc(50% + ${cx}px - ${BTN / 2}px)`,
                  top: `calc(50% + ${cy}px - ${BTN / 2}px)`,
                }}
              >
                <motion.button
                  onClick={() => pickChord(chord.label)}
                  whileHover={{ scale: 1.12 }}
                  whileTap={{ scale: 0.92 }}
                  className="flex flex-col items-center justify-center rounded-full cursor-pointer"
                  style={{
                    width: BTN, height: BTN,
                    backdropFilter: "blur(16px) saturate(150%)",
                    background: active ? accentAlpha(0.2) : "rgba(255,255,255,0.07)",
                    border: `1px solid ${active ? accentAlpha(0.55) : "rgba(255,255,255,0.12)"}`,
                    boxShadow: active ? `0 0 22px ${accentAlpha(0.3)}` : "none",
                    transition: "background 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease",
                  }}
                >
                  <span className="text-base leading-none">{chord.emoji}</span>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)", fontSize: "0.56rem", marginTop: 3,
                      letterSpacing: "0.03em", lineHeight: 1.1, textAlign: "center", maxWidth: 54,
                      color: active ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.5)",
                      transition: "color 0.3s ease",
                    }}
                  >
                    {chord.label}
                  </span>
                </motion.button>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Bottom hint ── */}
      <div className="absolute bottom-5 inset-x-0 flex justify-center z-10 pointer-events-none">
        <span
          style={{
            fontFamily: "var(--font-mono)", fontSize: "0.62rem", letterSpacing: "0.22em",
            color: "rgba(255,255,255,0.16)", textTransform: "uppercase",
          }}
        >
          Bimanual gesture mode · AR overlay
        </span>
      </div>
    </div>
  );
}
