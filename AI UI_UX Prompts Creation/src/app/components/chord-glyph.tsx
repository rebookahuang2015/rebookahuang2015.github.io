import { motion } from "motion/react";
import { ReactNode } from "react";

/**
 * Glowing neon "light-painting" of a chord-type icon.
 *
 * Every icon is a smooth, iconic shape rendered as several concentric echoes
 * that DRAW THEMSELVES on (animated pathLength), in the style of the reference
 * fractal-heart visual. Each chord also carries its own ambient motion so the
 * visual feels alive: rain falls, the black hole swirls, lightning flickers,
 * the leaf sways, waves ripple outward, sand drips through the hourglass.
 */

const COMMON_STROKE = {
  fill: "none",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  vectorEffect: "non-scaling-stroke" as const,
};

// A single echo of a path that draws itself on, staggered by index.
function Echo({ d, scale, index, total }: { d: string; scale: number; index: number; total: number }) {
  return (
    <motion.path
      d={d}
      transform={`scale(${scale})`}
      {...COMMON_STROKE}
      initial={{ pathLength: 0, opacity: 0 }}
      animate={{ pathLength: 1, opacity: 0.35 + (index / (total - 1)) * 0.6 }}
      transition={{
        pathLength: { duration: 1.0, delay: index * 0.09, ease: "easeInOut" },
        opacity: { duration: 0.4, delay: index * 0.09 },
      }}
    />
  );
}

// Build N concentric drawing echoes of one closed path.
function echoes(d: string, count: number, min = 0.3) {
  return Array.from({ length: count }, (_, i) => {
    const scale = min + ((1 - min) * i) / (count - 1);
    return <Echo key={i} d={d} scale={scale} index={i} total={count} />;
  });
}

const SUN_RAYS = Array.from({ length: 10 }, (_, i) => {
  const a = (i * 360) / 10;
  const rad = (a * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  // stubby rounded rays, not thin spokes
  return (
    <motion.path
      key={i}
      d={`M${c * 44},${s * 44} L${c * 62},${s * 62}`}
      {...COMMON_STROKE}
      strokeWidth={4}
      initial={{ pathLength: 0, opacity: 0 }}
      animate={{ pathLength: 1, opacity: 0.9 }}
      transition={{ pathLength: { duration: 0.5, delay: 0.4 + i * 0.05 }, opacity: { duration: 0.3, delay: 0.4 + i * 0.05 } }}
    />
  );
});

const RAIN = Array.from({ length: 6 }, (_, i) => {
  const x = -40 + i * 16;
  return (
    <motion.line
      key={i}
      x1={x} y1={30} x2={x - 4} y2={44}
      stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: [0, 0.9, 0], y: [-8, 30, 46] }}
      transition={{ duration: 1.3, delay: i * 0.15, repeat: Infinity, ease: "easeIn" }}
    />
  );
});

const CLOUD = "M-46,16 C-64,16 -64,-8 -46,-12 C-48,-36 -16,-44 -2,-26 C6,-42 40,-38 40,-14 C58,-14 58,18 40,18 Z";
const CRESCENT = "M22,-48 A48,48 0 1,0 22,48 A36,36 0 1,1 22,-48 Z";
const LEAF = "M0,-58 C40,-32 40,32 0,58 C-40,32 -40,-32 0,-58 Z";
const BOLT = "M10,-60 L-26,6 L-4,6 L-14,60 L30,-8 L6,-8 L22,-60 Z";
const HOURGLASS = "M-34,-52 L34,-52 C34,-28 6,-6 0,0 C6,6 34,28 34,52 L-34,52 C-34,28 -6,6 0,0 C-6,-6 -34,-28 -34,-52 Z";

function chordArt(chord: string): { spin?: boolean; sway?: boolean; content: ReactNode } {
  switch (chord) {
    case "Major": // ☀️ sun — glowing core + rays + soft aura ring
      return {
        content: (
          <>
            {echoes("M0,-34 C22,-34 34,-22 34,0 C34,22 22,34 0,34 C-22,34 -34,22 -34,0 C-34,-22 -22,-34 0,-34 Z", 3, 0.5)}
            {SUN_RAYS}
            <motion.circle
              cx={0} cy={0} r={16} fill="currentColor"
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 0.85, scale: 1 }}
              transition={{ duration: 0.6, delay: 0.2 }}
            />
          </>
        ),
      };
    case "Dom 7": // ⚡ lightning — flicker
      return {
        content: (
          <motion.g
            animate={{ opacity: [1, 0.55, 1, 0.8, 1] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
          >
            {echoes(BOLT, 6, 0.32)}
          </motion.g>
        ),
      };
    case "Minor": // 🌧️ rain cloud
      return { content: <>{echoes(CLOUD, 4, 0.45)}{RAIN}</> };
    case "Min 7": // 🌊 rippling waves
      return {
        content: (
          <>
            {[0, 1, 2, 3].map((i) => (
              <motion.path
                key={i}
                d="M-64,0 Q-32,-30 0,0 T64,0"
                {...COMMON_STROKE}
                initial={{ opacity: 0, scale: 0.4, y: 20 }}
                animate={{ opacity: [0, 0.9, 0], scale: [0.4, 1.3, 1.6], y: [20, -10, -30] }}
                transition={{ duration: 3, delay: i * 0.75, repeat: Infinity, ease: "easeOut" }}
              />
            ))}
          </>
        ),
      };
    case "Dim": // 🌑 black hole — swirling rings
      return {
        spin: true,
        content: (
          <>
            {[18, 30, 44, 58].map((r, i) => (
              <motion.circle
                key={r} cx={0} cy={0} r={r}
                {...COMMON_STROKE}
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 0.4 + i * 0.15 }}
                transition={{ pathLength: { duration: 1, delay: i * 0.12 }, opacity: { duration: 0.4, delay: i * 0.12 } }}
              />
            ))}
            <motion.ellipse
              cx={0} cy={0} rx={64} ry={22} transform="rotate(-22)"
              {...COMMON_STROKE} strokeWidth={2.5}
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 0.9 }}
              transition={{ duration: 1.2, delay: 0.3 }}
            />
            <motion.circle
              cx={0} cy={0} r={8} fill="currentColor"
              initial={{ opacity: 0 }} animate={{ opacity: [0.4, 0.9, 0.4] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
          </>
        ),
      };
    case "Sus 4": // ⏳ hourglass — dripping sand
      return {
        content: (
          <>
            {echoes(HOURGLASS, 5, 0.4)}
            <motion.circle
              cx={0} cy={0} r={3.5} fill="currentColor"
              initial={{ cy: -30, opacity: 0 }}
              animate={{ cy: [-30, 40], opacity: [0, 1, 1, 0] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: "easeIn" }}
            />
          </>
        ),
      };
    case "Sus 2": // 🍃 leaf — gentle sway
      return {
        sway: true,
        content: (
          <>
            {echoes(LEAF, 5, 0.4)}
            <motion.path
              d="M0,-52 L0,52" {...COMMON_STROKE}
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 0.8 }}
              transition={{ duration: 1, delay: 0.5 }}
            />
          </>
        ),
      };
    case "Maj 7": // 🌙 crescent moon
    default:
      return { content: <>{echoes(CRESCENT, 6, 0.34)}</> };
  }
}

export function ChordGlyph({ chord, color, glowId }: { chord: string; color: string; glowId: string }) {
  const art = chordArt(chord);

  let inner = <g stroke="currentColor">{art.content}</g>;
  if (art.spin) {
    inner = (
      <motion.g stroke="currentColor" animate={{ rotate: 360 }} transition={{ duration: 24, ease: "linear", repeat: Infinity }}>
        {art.content}
      </motion.g>
    );
  } else if (art.sway) {
    inner = (
      <motion.g stroke="currentColor" animate={{ rotate: [-5, 5, -5] }} transition={{ duration: 5, ease: "easeInOut", repeat: Infinity }}>
        {art.content}
      </motion.g>
    );
  }

  return (
    <svg viewBox="-100 -100 200 200" className="w-full h-full" style={{ color }} aria-label={`${chord} glyph`}>
      <defs>
        <filter id={glowId} x="-70%" y="-70%" width="240%" height="240%">
          <feGaussianBlur stdDeviation="2.4" result="b1" />
          <feGaussianBlur stdDeviation="6" result="b2" />
          <feMerge>
            <feMergeNode in="b2" />
            <feMergeNode in="b1" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <radialGradient id={`${glowId}-aura`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.35" />
          <stop offset="60%" stopColor="currentColor" stopOpacity="0.08" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </radialGradient>
      </defs>

      <circle cx="0" cy="0" r="96" fill={`url(#${glowId}-aura)`} />
      <g filter={`url(#${glowId})`}>{inner}</g>
    </svg>
  );
}
