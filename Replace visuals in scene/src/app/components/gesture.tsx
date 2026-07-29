// ============================================================
// Gesture detection + chord theory (ported from Gesture Symphony)
// ============================================================

export type Landmark = { x: number; y: number; z: number };
export type Handedness = { label: "Left" | "Right"; score: number };

export const LM = {
  WRIST: 0,
  THUMB_CMC: 1, THUMB_MCP: 2, THUMB_IP: 3, THUMB_TIP: 4,
  INDEX_MCP: 5, INDEX_PIP: 6, INDEX_DIP: 7, INDEX_TIP: 8,
  MIDDLE_MCP: 9, MIDDLE_PIP: 10, MIDDLE_DIP: 11, MIDDLE_TIP: 12,
  RING_MCP: 13, RING_PIP: 14, RING_DIP: 15, RING_TIP: 16,
  PINKY_MCP: 17, PINKY_PIP: 18, PINKY_DIP: 19, PINKY_TIP: 20,
} as const;

export const BONES: [number, number][] = [
  [0, 1], [0, 5], [0, 17], [5, 9], [9, 13], [13, 17],
  [1, 2], [2, 3], [3, 4],
  [5, 6], [6, 7], [7, 8],
  [9, 10], [10, 11], [11, 12],
  [13, 14], [14, 15], [15, 16],
  [17, 18], [18, 19], [19, 20],
];

export const QUALITY_INTERVALS: Record<string, number[]> = {
  Major: [0, 4, 7], Minor: [0, 3, 7],
  Maj7: [0, 4, 7, 11], Min7: [0, 3, 7, 10],
  Dom7: [0, 4, 7, 10], Dim: [0, 3, 6],
  Sus4: [0, 5, 7], Sus2: [0, 2, 7],
};

export const HARMONIOUS_PAIRS: Record<string, string> = {
  "C+Am": "♥ vi chord (Relative Minor)",
  "C+Em": "♥ iii chord (Mediant Minor)",
  "C+G": "♥ V chord (Perfect Fifth)",
  "G+Em": "♥ vi chord (Relative Minor)",
  "Am+F": "♥ IV chord (Subdominant)",
  "Am+Em": "♥ v chord (Minor Dominant)",
  "F+C": "♥ IV–I (Plagal Cadence)",
  "G+Am": "♥ V–vi (Deceptive Resolution)",
  "D+Bm": "♥ vi chord (Relative Minor)",
  "A+D": "♥ IV chord (Perfect Fourth)",
  "E+Am": "♥ V–i (Authentic Cadence)",
};

export const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export const ROOT_GESTURES = [
  { note: "C", emoji: "🫰", label: "C" },
  { note: "D", emoji: "✌️", label: "D" },
  { note: "E", emoji: "👌", label: "E" },
  { note: "F", emoji: "🤟", label: "F" },
  { note: "G", emoji: "✋", label: "G" },
  { note: "A", emoji: "🤙", label: "A" },
  { note: "B", emoji: "☝️", label: "B" },
  { note: "C5", emoji: "🤌", label: "C (8va)" },
  { note: "Stop", emoji: "👊", label: "Stop", stop: true },
];

export const QUALITY_NODES = [
  { quality: "Maj7", emoji: "🌙", label: "Maj 7", angle: 270 },
  { quality: "Major", emoji: "☀️", label: "Major", angle: 315 },
  { quality: "Dom7", emoji: "⚡", label: "Dom 7", angle: 0 },
  { quality: "Minor", emoji: "🌧️", label: "Minor", angle: 45 },
  { quality: "Min7", emoji: "🌊", label: "Min 7", angle: 90 },
  { quality: "Dim", emoji: "🕳️", label: "Dim", angle: 135 },
  { quality: "Sus4", emoji: "⏳", label: "Sus 4", angle: 180 },
  { quality: "Sus2", emoji: "🫧", label: "Sus 2", angle: 225 },
];

export const POINT_HIT_RADIUS = 90;

// ---- Geometry helpers ----
function d(a: Landmark, b: Landmark) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function fingerExtended(lm: Landmark[], tip: number, pip: number) {
  const w = lm[LM.WRIST];
  const dTip = Math.hypot(lm[tip].x - w.x, lm[tip].y - w.y);
  const dPip = Math.hypot(lm[pip].x - w.x, lm[pip].y - w.y);
  return dTip > dPip * 1.05;
}

function fingerCurled(lm: Landmark[], tip: number, pip: number) {
  return !fingerExtended(lm, tip, pip);
}

function thumbOut(lm: Landmark[], label: string) {
  const tip = lm[LM.THUMB_TIP], ip = lm[LM.THUMB_IP];
  return label === "Left" ? tip.x > ip.x + 0.015 : tip.x < ip.x - 0.015;
}

// Root-note gesture (C, D, E, F, G, A, B, C5, Stop)
export function detectRootGesture(lm: Landmark[], label: string): string | null {
  const idxE = fingerExtended(lm, LM.INDEX_TIP, LM.INDEX_PIP);
  const midE = fingerExtended(lm, LM.MIDDLE_TIP, LM.MIDDLE_PIP);
  const rngE = fingerExtended(lm, LM.RING_TIP, LM.RING_PIP);
  const pnkE = fingerExtended(lm, LM.PINKY_TIP, LM.PINKY_PIP);
  const thmE = thumbOut(lm, label);
  const midC = !midE, rngC = !rngE, pnkC = !pnkE;

  const handScale = d(lm[LM.WRIST], lm[LM.MIDDLE_MCP]);
  const scale = handScale > 0.01 ? handScale : 1.0;

  const t_i = d(lm[LM.THUMB_TIP], lm[LM.INDEX_TIP]) / scale;
  const t_m = d(lm[LM.THUMB_TIP], lm[LM.MIDDLE_TIP]) / scale;
  const t_r = d(lm[LM.THUMB_TIP], lm[LM.RING_TIP]) / scale;
  const t_p = d(lm[LM.THUMB_TIP], lm[LM.PINKY_TIP]) / scale;
  if (t_i < 0.42 && t_m < 0.42 && t_r < 0.42 && t_p < 0.42) return "C5";

  const thumbIdxDistNorm = d(lm[LM.THUMB_TIP], lm[LM.INDEX_TIP]) / scale;
  const idxTipToMCPNorm = d(lm[LM.INDEX_TIP], lm[LM.INDEX_MCP]) / scale;
  const thumbIdxMCPDistNorm = d(lm[LM.THUMB_TIP], lm[LM.INDEX_MCP]) / scale;

  if (thumbIdxDistNorm < 0.5 && midE && rngE && pnkE) return "E";
  if (thumbIdxDistNorm < 0.5 && midC && rngC && pnkC && idxTipToMCPNorm > 0.4) return "C";
  if (!idxE && midC && rngC && pnkC && idxTipToMCPNorm <= 0.4) return "Stop";
  if (thmE && idxE && pnkE && midC && rngC) return "F";
  const thumbWide = thumbIdxMCPDistNorm > 0.65;
  if ((thmE || thumbWide) && pnkE && !idxE && midC && rngC) return "A";
  if (idxE && midE && rngC && pnkC) return "D";
  if (idxE && midC && rngC && pnkC && thumbIdxDistNorm > 0.55) return "B";
  if (idxE && midE && rngE && pnkE) return "G";

  return null;
}

// Pointing hand → hit-test against a set of quality node screen positions
export function detectPointing(
  lm: Landmark[],
  nodes: { quality: string; cx: number; cy: number }[],
  canvasW: number,
  canvasH: number
): string | null {
  const idxE = fingerExtended(lm, LM.INDEX_TIP, LM.INDEX_PIP);
  const midC = fingerCurled(lm, LM.MIDDLE_TIP, LM.MIDDLE_PIP);
  const rngC = fingerCurled(lm, LM.RING_TIP, LM.RING_PIP);
  const pnkC = fingerCurled(lm, LM.PINKY_TIP, LM.PINKY_PIP);
  if (!idxE || !midC || !rngC || !pnkC) return null;

  const tipX = (1 - lm[LM.INDEX_TIP].x) * canvasW;
  const tipY = lm[LM.INDEX_TIP].y * canvasH;

  let closest: string | null = null;
  let closestDist = Infinity;
  for (const n of nodes) {
    const dist = Math.hypot(tipX - n.cx, tipY - n.cy);
    if (dist < closestDist) {
      closestDist = dist;
      closest = n.quality;
    }
  }
  return closestDist <= POINT_HIT_RADIUS ? closest : null;
}

export function checkHarmony(c1: string, c2: string): string | null {
  if (!c1 || c1 === "—" || !c2 || c2 === "—") return null;
  return HARMONIOUS_PAIRS[`${c1}+${c2}`] || HARMONIOUS_PAIRS[`${c2}+${c1}`] || null;
}

// ---- Chord voicing ----
function midiToNote(m: number) {
  return NOTE_NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
}

const CHORD_CENTER = 60;
const BASS_MIDI_BASE = 36;

function nearestOctave(pc: number, ref: number, lo = 36, hi = 96) {
  let best = pc, bestDist = Infinity;
  for (let m = pc; m <= hi; m += 12) {
    if (m < lo) continue;
    const dist = Math.abs(m - ref);
    if (dist < bestDist) { bestDist = dist; best = m; }
  }
  return best;
}

export function voiceBlockChord(root: string | null, quality: string | null): string[] | null {
  if (!root || root === "Stop" || !quality) return null;
  let ri = NOTE_NAMES.indexOf(root);
  let octaveOffset = 0;
  if (root === "C5") { ri = 0; octaveOffset = 12; }
  const iv = QUALITY_INTERVALS[quality];
  if (ri < 0 || !iv) return null;

  const bass = midiToNote((ri % 12) + BASS_MIDI_BASE + octaveOffset);
  const body = iv.map((interval) => {
    const pc = (ri + interval) % 12;
    return midiToNote(nearestOctave(pc, CHORD_CENTER + octaveOffset, 52 + octaveOffset, 76 + octaveOffset));
  });
  return [bass, ...body];
}

export function buildArpPool(root: string | null, quality: string | null): string[] | null {
  if (!root || root === "Stop" || !quality) return null;
  let ri = NOTE_NAMES.indexOf(root);
  let octaveOffset = 0;
  if (root === "C5") { ri = 0; octaveOffset = 12; }
  const base = QUALITY_INTERVALS[quality];
  if (ri < 0 || !base) return null;

  const intervals = new Set(base);
  intervals.add(14); // 9th shimmer
  if (base.length === 3 && quality !== "Dim") {
    const isMinor = base.includes(3);
    intervals.add(isMinor ? 10 : 11);
  }
  const sorted = [...intervals].sort((a, b) => a - b);
  const rootMidi = ri + 60 + octaveOffset;
  const pool: number[] = [];
  for (const octave of [0, 12]) {
    for (const iv of sorted) pool.push(rootMidi + octave + iv);
  }
  return pool.map(midiToNote);
}

export function chordDisplayName(root: string | null, quality: string | null): string {
  if (!root || root === "Stop" || !quality) return "—";
  const rootLabel = root === "C5" ? "C (8va)" : root;
  const m: Record<string, string> = {
    Major: "", Minor: "m", Maj7: "Maj7", Min7: "m7", Dom7: "7", Dim: "dim", Sus4: "sus4", Sus2: "sus2",
  };
  return rootLabel + (m[quality] ?? quality);
}
