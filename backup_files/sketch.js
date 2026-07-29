'use strict';
/* ===================================================================
   GESTURE SYMPHONY — sketch.js
   MediaPipe Hands + Tone.js + Canvas

   Sections:
   1. Constants & Landmark Indices
   2. State
   3. Left Hand Gesture Detection (matched to emojis)
   4. Right Hand — Fingertip Pointing Selection
   5. Chord Voicing & Audio Engine
   6. Sound Controls Bindings
   7. Hand Skeleton Rendering
   8. UI Updates
   9. MediaPipe onResults (main frame loop)
   10. Init
   =================================================================== */

// ===================================================================
// 1. CONSTANTS
// ===================================================================

const LM = {
  WRIST:0,
  THUMB_CMC:1, THUMB_MCP:2, THUMB_IP:3, THUMB_TIP:4,
  INDEX_MCP:5, INDEX_PIP:6, INDEX_DIP:7, INDEX_TIP:8,
  MIDDLE_MCP:9, MIDDLE_PIP:10, MIDDLE_DIP:11, MIDDLE_TIP:12,
  RING_MCP:13, RING_PIP:14, RING_DIP:15, RING_TIP:16,
  PINKY_MCP:17, PINKY_PIP:18, PINKY_DIP:19, PINKY_TIP:20
};

const BONES = [
  [0,1],[0,5],[0,17],[5,9],[9,13],[13,17],
  [1,2],[2,3],[3,4],
  [5,6],[6,7],[7,8],
  [9,10],[10,11],[11,12],
  [13,14],[14,15],[15,16],
  [17,18],[18,19],[19,20]
];

// Chord quality intervals (semitones from root)
const QUALITY_INTERVALS = {
  'Major': [0,4,7],       'Minor': [0,3,7],
  'Maj7':  [0,4,7,11],    'Min7':  [0,3,7,10],
  'Dom7':  [0,4,7,10],    'Dim':   [0,3,6],
  'Sus4':  [0,5,7],       'Sus2':  [0,2,7]
};

const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

// ===================================================================
// 2. STATE
// ===================================================================

let audioStarted = false;
let currentRoot = null;
let currentQuality = null;
let previousChordKey = null;
let activeAudioChord = null;

// Autoplay (Smart Instrument) state
let autoplayLevel = 0;
let seqLoop = null;
let seqStep = 0;

// Debounce
let lastRawRoot = null, rootSince = 0, stableRoot = null;
let lastRawQuality = null, qualitySince = 0, stableQuality = 'Major';
const DEBOUNCE_ROOT_MS = 180;
const DEBOUNCE_QUALITY_MS = 120;

// Tone.js nodes — MULTI-TIMBRE architecture:
// Three instrument SETS, each containing a chord instrument and an arp instrument.
// chordSampler / arpSampler are ACTIVE pointers — setTimbre() swaps them.
//   • strings:  Tone.Sampler (cello) + Tone.Sampler (violin) — recorded orchestral
//   • synth:    Tone.PolySynth (FM Rhodes pad) + Tone.PolySynth (FM bell arp)
//   • woodwind: Tone.PolySynth (FM flute pad) + Tone.PolySynth (FM clarinet arp)
let chordSampler = null, arpSampler = null;  // active instrument pointers
let hpFilter = null, lpFilter = null, reverb = null, vol = null;

// Instrument bank (initialized in initAudio)
const instruments = {
  strings:  { chord: null, arp: null },
  synth:    { chord: null, arp: null },
  woodwind: { chord: null, arp: null }
};

// True only once ALL instruments have finished initializing.
let samplersLoaded = false;
let samplersLoadedCount = 0;

// ADSR canvas
let adsrCanvas = null, adsrCtx = null;

// DSP state
const dsp = {
  attack: 0.08, decay: 0.3, sustain: 0.5, release: 1.0,
  hpFreq: 20, lpFreq: 20000,
  reverbWet: 0.3, volume: -6, velocity: 0.55,
  timbre: 'strings'
};

// Canvas / video
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const videoEl = document.getElementById('webcam');

// ===================================================================
// 3. LEFT HAND GESTURE DETECTION — matched to emojis
//
//    🫰 C  — thumb+index tips touching, others curled (finger heart)
//    ✌️ D  — index+middle extended, ring+pinky curled (peace sign)
//    👌 E  — thumb+index tips touching, others EXTENDED (OK hand)
//    🤟 F  — thumb+index+pinky extended, mid+ring curled (ILY)
//    🤙 A  — thumb+pinky extended, idx/mid/rng curled (shaka)
//    ✋ G  — all fingers extended (open palm)
//    👊 Stop — all fingers curled, fist
// ===================================================================

function d(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

function fingerExtended(lm, tip, pip) {
  const w = lm[LM.WRIST];
  const dTip = Math.hypot(lm[tip].x - w.x, lm[tip].y - w.y);
  const dPip = Math.hypot(lm[pip].x - w.x, lm[pip].y - w.y);
  return dTip > dPip * 1.05;
}

function fingerCurled(lm, tip, pip) {
  return !fingerExtended(lm, tip, pip);
}

function thumbOut(lm, label) {
  const tip = lm[LM.THUMB_TIP], ip = lm[LM.THUMB_IP];
  // In raw camera image: Left hand thumb extends right (+x), Right hand thumb extends left (-x)
  return label === 'Left' ? (tip.x > ip.x + 0.015) : (tip.x < ip.x - 0.015);
}

function detectLeftGesture(lm, label) {
  // Pre-compute all finger extension states (scale-invariant)
  const idxE = fingerExtended(lm, LM.INDEX_TIP, LM.INDEX_PIP);
  const midE = fingerExtended(lm, LM.MIDDLE_TIP, LM.MIDDLE_PIP);
  const rngE = fingerExtended(lm, LM.RING_TIP, LM.RING_PIP);
  const pnkE = fingerExtended(lm, LM.PINKY_TIP, LM.PINKY_PIP);
  const thmE = thumbOut(lm, label);

  const midC = !midE, rngC = !rngE, pnkC = !pnkE;

  // Scale factor (distance from wrist to middle MCP)
  const handScale = d(lm[LM.WRIST], lm[LM.MIDDLE_MCP]);
  const scale = handScale > 0.01 ? handScale : 1.0;

  // Normalized scale-invariant distances
  const thumbIdxDistNorm = d(lm[LM.THUMB_TIP], lm[LM.INDEX_TIP]) / scale;
  const idxTipToMCPNorm = d(lm[LM.INDEX_TIP], lm[LM.INDEX_MCP]) / scale;
  const thumbIdxMCPDistNorm = d(lm[LM.THUMB_TIP], lm[LM.INDEX_MCP]) / scale;

  // ── 1. 👌 E — OK hand: thumb+index touching, others EXTENDED
  if (thumbIdxDistNorm < 0.5 && midE && rngE && pnkE) return 'E';

  // ── 2. 🫰 C — Finger heart: thumb+index touching, others CURLED
  //   We require idxTipToMCPNorm > 0.4 so a tightly curled fist is not misclassified as C.
  if (thumbIdxDistNorm < 0.5 && midC && rngC && pnkC && idxTipToMCPNorm > 0.4) return 'C';

  // ── 3. 👊 Stop — Fist: all fingers curled tightly
  if (!idxE && midC && rngC && pnkC && idxTipToMCPNorm <= 0.4) return 'Stop';

  // ── 4. 🤟 F — ILY: thumb+index+pinky extended, middle+ring curled
  if (thmE && idxE && pnkE && midC && rngC) return 'F';

  // ── 5. 🤙 A — Shaka: thumb+pinky extended, index/mid/ring curled
  const thumbWide = thumbIdxMCPDistNorm > 0.65;
  if ((thmE || thumbWide) && pnkE && !idxE && midC && rngC) return 'A';

  // ── 6. ✌️ D — Peace: index+middle extended, ring+pinky curled
  if (idxE && midE && rngC && pnkC) return 'D';

  // ── 7. ☝️ B — Point up: only index extended, index and thumb not touching/pinched
  if (idxE && midC && rngC && pnkC && thumbIdxDistNorm > 0.55) return 'B';

  // ── 8. ✋ G — Open palm: all 4 fingers extended
  if (idxE && midE && rngE && pnkE) return 'G';

  return null;
}

// ===================================================================
// 4. RIGHT HAND — FINGERTIP ☝️ POINTING SELECTION
//
//    User must be doing the ☝️ gesture (index extended, rest curled).
//    The screen position of the index fingertip is compared to each
//    orbital node's position. The closest node within range is selected.
// ===================================================================

/** Maximum pixel distance from fingertip to orbital node center for selection */
const POINT_HIT_RADIUS = 90;

function detectRightHandPointing(lm, label) {
  // ── Step 1: verify pointing gesture ──
  const idxE = fingerExtended(lm, LM.INDEX_TIP, LM.INDEX_PIP);
  const midC = fingerCurled(lm, LM.MIDDLE_TIP, LM.MIDDLE_PIP);
  const rngC = fingerCurled(lm, LM.RING_TIP, LM.RING_PIP);
  const pnkC = fingerCurled(lm, LM.PINKY_TIP, LM.PINKY_PIP);

  if (!idxE || !midC || !rngC || !pnkC) return null;

  // ── Step 2: index fingertip screen position (mirrored) ──
  const tipX = (1 - lm[LM.INDEX_TIP].x) * canvas.width;
  const tipY = lm[LM.INDEX_TIP].y * canvas.height;

  // ── Step 3: find nearest orbital node ──
  const nodes = document.querySelectorAll('.orbital-node');
  let closest = null, closestDist = Infinity;

  for (const node of nodes) {
    const rect = node.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dist = Math.hypot(tipX - cx, tipY - cy);
    if (dist < closestDist) {
      closestDist = dist;
      closest = node.dataset.quality;
    }
  }

  // Only select if within hit radius
  return (closestDist <= POINT_HIT_RADIUS) ? closest : null;
}

// ===================================================================
// 5. CHORD VOICING & AUDIO ENGINE
// ===================================================================

function midiToNote(m) {
  return NOTE_NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
}

// ── Register anchors (MIDI note numbers) ──
const CHORD_CENTER = 60;    // C4 — the block-chord voicing gravitates here
const BASS_MIDI_BASE = 36;  // C2 — left-hand root anchor beneath the chord

/**
 * Place a pitch-class (0–11) into whichever octave lands its MIDI note
 * closest to a reference note, within an optional [lo, hi] window.
 * This is the primitive that gives us inversions "for free".
 */
function nearestOctave(pc, ref, lo = 36, hi = 96) {
  let best = pc, bestDist = Infinity;
  for (let m = pc; m <= hi; m += 12) {
    if (m < lo) continue;
    const dist = Math.abs(m - ref);
    if (dist < bestDist) { bestDist = dist; best = m; }
  }
  return best;
}

/**
 * LEFT HAND — sustained block-chord voicing with smooth voice-leading.
 *
 * Each chord tone is dropped into the octave nearest a FIXED register
 * center (CHORD_CENTER). Because a given pitch-class always resolves to
 * the same octave, any note shared between two successive chords stays
 * put (common tones held) while the rest move by the smallest possible
 * interval — the essence of good voice-leading / inversion. A root note
 * an octave-and-change below grounds the harmony like a left-hand bass.
 *
 * Returns an array of note-name strings, or null when there's nothing to play.
 */
function voiceBlockChord(root, quality) {
  if (!root || root === 'Stop' || !quality) return null;
  const ri = NOTE_NAMES.indexOf(root);
  const iv = QUALITY_INTERVALS[quality];
  if (ri < 0 || !iv) return null;

  const bass = midiToNote((ri % 12) + BASS_MIDI_BASE); // root, octave 2
  const body = iv.map(interval => {
    const pc = (ri + interval) % 12;
    // Keep the body compact (roughly E3–E4) so inversions stay smooth.
    return midiToNote(nearestOctave(pc, CHORD_CENTER, 52, 76));
  });
  return [bass, ...body];
}

/**
 * RIGHT HAND — ascending note pool the arpeggiator draws from.
 *
 * Beyond the raw chord tones we fold in tension/extension colors so the
 * runs naturally outline the lush notes of modern piano playing:
 *   • the 9th is always added for shimmer;
 *   • a plain triad also gains a color 7th (maj7 over major, b7 over minor)
 *     so even a simple "Major" chord sings like an add9 / maj9.
 * The pool is spread over two octaves starting near C4 so the arpeggio
 * sits ON TOP of the block chord instead of muddying it.
 *
 * Returns an array of note-name strings (ascending), or null.
 */
function buildArpPool(root, quality) {
  if (!root || root === 'Stop' || !quality) return null;
  const ri = NOTE_NAMES.indexOf(root);
  const base = QUALITY_INTERVALS[quality];
  if (ri < 0 || !base) return null;

  const intervals = new Set(base);
  intervals.add(14); // the 9th — always, for a lush extension
  if (base.length === 3 && quality !== 'Dim') {
    const isMinor = base.includes(3);
    intervals.add(isMinor ? 10 : 11); // color 7th on bare triads
  }
  const sorted = [...intervals].sort((a, b) => a - b);

  const rootMidi = ri + 60; // root near/above middle C
  const pool = [];
  for (const octave of [0, 12]) {
    for (const iv of sorted) pool.push(rootMidi + octave + iv);
  }
  return pool.map(midiToNote);
}

function chordDisplayName(root, quality) {
  if (!root || root === 'Stop' || !quality) return '—';
  const m = { Major:'', Minor:'m', Maj7:'Maj7', Min7:'m7', Dom7:'7', Dim:'dim', Sus4:'sus4', Sus2:'sus2' };
  return root + (m[quality] ?? quality);
}

// Public-domain orchestral samples from the tonejs-instruments project,
// downloaded into the local ./samples folder so the app works fully
// offline and loads instantly (no CDN round-trips).
// Tone.Sampler only needs a sparse map — it repitches the nearest sample
// to fill in every note in between, so ~12 samples cover the full range.
const SAMPLE_BASE = 'samples/';

// Cello map: C2 → A4. Covers the chord voicing's bass (C2) and body (E3–E4).
const CELLO_URLS = {
  'C2':'C2.mp3','E2':'E2.mp3','G2':'G2.mp3','A2':'A2.mp3',
  'C3':'C3.mp3','E3':'E3.mp3','G3':'G3.mp3','A3':'A3.mp3',
  'C4':'C4.mp3','E4':'E4.mp3','G4':'G4.mp3','A4':'A4.mp3'
};

// Violin map: A3 → G6. Covers the arp pool (C4 up two octaves + extensions).
const VIOLIN_URLS = {
  'A3':'A3.mp3','C4':'C4.mp3','E4':'E4.mp3','G4':'G4.mp3',
  'A4':'A4.mp3','C5':'C5.mp3','E5':'E5.mp3','G5':'G5.mp3',
  'A5':'A5.mp3','C6':'C6.mp3','E6':'E6.mp3','G6':'G6.mp3'
};

// Called by each sampler's onload. When both have reported in, arm the
// engine and flip the overlay hint from "loading" to "tap to begin".
function onSamplerLoaded(which) {
  samplersLoadedCount++;
  console.log(`[samples] ${which} section loaded (${samplersLoadedCount}/2)`);
  if (samplersLoadedCount >= 2) {
    samplersLoaded = true;
    const sub = document.querySelector('.overlay-subtitle');
    if (sub) sub.textContent = 'Tap anywhere to begin';
  }
}

function initAudio() {
  // ── Shared "glue" bus: HP → LP → Reverb → Volume → speakers ──
  hpFilter = new Tone.Filter({ frequency: dsp.hpFreq, type: 'highpass', rolloff: -12 });
  lpFilter = new Tone.Filter({ frequency: dsp.lpFreq, type: 'lowpass', rolloff: -12 });
  reverb  = new Tone.Reverb({ decay: 2.2, wet: dsp.reverbWet, preDelay: 0.01 });
  vol     = new Tone.Volume(dsp.volume);
  hpFilter.chain(lpFilter, reverb, vol, Tone.Destination);

  // ════════════════════════════════════════════════════════════════
  // STRINGS — Cello (chords) + Violin (arps) sample-based
  // ════════════════════════════════════════════════════════════════
  instruments.strings.chord = new Tone.Sampler({
    urls: CELLO_URLS,
    baseUrl: SAMPLE_BASE + 'cello/',
    attack: 0.25, release: 1.2, volume: -8,
    onload: () => onSamplerLoaded('cello')
  });
  instruments.strings.arp = new Tone.Sampler({
    urls: VIOLIN_URLS,
    baseUrl: SAMPLE_BASE + 'violin/',
    attack: 0.03, release: 0.6, volume: -10,
    onload: () => onSamplerLoaded('violin')
  });
  instruments.strings.chord.connect(hpFilter);
  instruments.strings.arp.connect(hpFilter);

  // ════════════════════════════════════════════════════════════════
  // SYNTH KEYS — FM Rhodes-style electric piano (smooth, glassy, warm)
  // ════════════════════════════════════════════════════════════════
  instruments.synth.chord = new Tone.PolySynth(Tone.FMSynth, {
    maxPolyphony: 8,
    harmonicity: 3.01,
    modulationIndex: 1.5,
    oscillator: { type: 'sine' },
    modulation: { type: 'triangle' },
    envelope: { attack: 0.06, decay: 0.8, sustain: 0.4, release: 1.5 },
    modulationEnvelope: { attack: 0.01, decay: 0.5, sustain: 0.2, release: 0.8 },
    volume: -12
  });
  instruments.synth.arp = new Tone.PolySynth(Tone.FMSynth, {
    maxPolyphony: 8,
    harmonicity: 2.0,
    modulationIndex: 2.5,
    oscillator: { type: 'sine' },
    modulation: { type: 'sine' },
    envelope: { attack: 0.01, decay: 0.35, sustain: 0.15, release: 0.5 },
    modulationEnvelope: { attack: 0.005, decay: 0.2, sustain: 0.1, release: 0.3 },
    volume: -14
  });
  instruments.synth.chord.connect(hpFilter);
  instruments.synth.arp.connect(hpFilter);

  // ════════════════════════════════════════════════════════════════
  // WOODWIND — FM flute/clarinet (breathy, reedy, hollow)
  // ════════════════════════════════════════════════════════════════
  instruments.woodwind.chord = new Tone.PolySynth(Tone.FMSynth, {
    maxPolyphony: 8,
    harmonicity: 1.0,
    modulationIndex: 4.0,
    oscillator: { type: 'sine' },
    modulation: { type: 'square' },
    envelope: { attack: 0.12, decay: 0.6, sustain: 0.5, release: 1.0 },
    modulationEnvelope: { attack: 0.08, decay: 0.4, sustain: 0.3, release: 0.6 },
    volume: -11
  });
  instruments.woodwind.arp = new Tone.PolySynth(Tone.FMSynth, {
    maxPolyphony: 8,
    harmonicity: 1.5,
    modulationIndex: 5.0,
    oscillator: { type: 'sine' },
    modulation: { type: 'square' },
    envelope: { attack: 0.02, decay: 0.25, sustain: 0.2, release: 0.4 },
    modulationEnvelope: { attack: 0.01, decay: 0.15, sustain: 0.15, release: 0.25 },
    volume: -13
  });
  instruments.woodwind.chord.connect(hpFilter);
  instruments.woodwind.arp.connect(hpFilter);

  // Set default active instruments to strings
  chordSampler = instruments.strings.chord;
  arpSampler   = instruments.strings.arp;

  // 16th-note master clock that drives the arpeggiator patterns.
  Tone.Transport.bpm.value = 100;
  seqLoop = new Tone.Loop(time => runSequencerStep(time), "16n").start(0);
}

// The sequencer ONLY ever plays the arpeggio sampler (violins). The block
// chord is handled independently by triggerChord() and sustains underneath
// at every level — the two-handed split is unchanged from the synth version.
function runSequencerStep(time) {
  // Never trigger before every violin/cello sample has finished loading.
  if (dsp.timbre === 'strings' && !samplersLoaded) { seqStep = 0; return; }
  // Level 0 = arpeggiator muted. Also bail if there's no chord to color.
  if (autoplayLevel === 0 || !audioStarted || !currentRoot || currentRoot === 'Stop' || !currentQuality) {
    seqStep = 0;
    return;
  }

  const pool = buildArpPool(currentRoot, currentQuality);
  if (!pool || !pool.length) return;
  const n = pool.length;                 // usually 8–10 notes across 2 octaves
  const v = dsp.velocity;

  const step = seqStep;                   // 0..15 within the bar
  seqStep = (seqStep + 1) % 16;

  if (autoplayLevel === 1) {
    // ── LEVEL 1 — expressive broken chord, one note per QUARTER note ──
    // Picks notes that span the full pool range to make the chord quality
    // clearly audible: root, the defining 3rd/color-tone, the 5th, and
    // the highest extension. This makes Major ≠ Minor ≠ Dom7 ≠ Maj7
    // sound dramatically different even at the simplest level.
    if (step % 4 === 0) {
      const beat = (step / 4) % 4;
      // Spread across the pool: bottom, 1/4, 1/2, 3/4 of the way up
      const spreadIdx = [
        0,                              // root (bass)
        Math.max(1, Math.floor(n / 4)), // 3rd or color tone
        Math.floor(n / 2),              // 5th or mid-range
        Math.min(n - 1, Math.floor(n * 3 / 4))  // upper extension
      ];
      const idx = spreadIdx[beat];
      arpSampler.triggerAttackRelease(pool[idx], "4n", time, v * 0.9);
    }
  } else if (autoplayLevel === 2) {
    // ── LEVEL 2 — flowing, continuous 8th-note arpeggio ──
    // A note on every even 16th (= eight 8ths per bar), rising and falling.
    if (step % 2 === 0) {
      const contour = [0, 1, 2, 3, 4, 3, 2, 1];
      const idx = contour[(step / 2) % contour.length] % n;
      arpSampler.triggerAttackRelease(pool[idx], "8n", time, v * 0.85);
    }
  } else if (autoplayLevel === 3) {
    // ── LEVEL 3 — dense, syncopated 16th-note run ──
    // A per-step index map (with a couple of rests to breathe) plus
    // two-note stabs on the off-beats for a rich, virtuosic feel.
    const runMap = {
      0: 0,  1: 2,  2: 4,  3: 5,
      4: 6,         6: 5,  7: 4,
      8: 3,  9: 5, 10: 7, 11: 6,
      12: 4, 13: 6, 14: 8, 15: 7
    };
    if (step in runMap) {
      const idx = runMap[step] % n;
      if (step === 4 || step === 10 || step === 14) {
        // Shimmering harmony a couple of pool-steps above on the syncopations.
        const hi = (idx + 2) % n;
        arpSampler.triggerAttackRelease([pool[idx], pool[hi]], "16n", time, v * 0.8);
      } else {
        arpSampler.triggerAttackRelease(pool[idx], "16n", time, v * 0.9);
      }
    }
  }
}

// Plays the SUSTAINED block chord. This now runs at EVERY autoplay level —
// the harmonic bed never drops out. The arpeggiator (runSequencerStep) layers
// on top of whatever chord is held here.
function triggerChord(root, quality) {
  // Synth/woodwind are ready instantly; only strings need sample loading
  if (!chordSampler || !audioStarted) return;
  if (dsp.timbre === 'strings' && !samplersLoaded) return;

  const key = root + '|' + quality;
  if (key === previousChordKey) return;          // already sustaining this chord
  chordSampler.releaseAll();                      // lift the previous voicing
  if (!root || root === 'Stop' || !quality) { previousChordKey = null; activeAudioChord = null; return; }
  const notes = voiceBlockChord(root, quality);
  if (notes) {
    // Hold the chord open (triggerAttack, no release) so the celli sustain
    // until the next chord change or a Stop — the left hand holding harmony.
    chordSampler.triggerAttack(notes, Tone.now(), dsp.velocity * 0.9);
    previousChordKey = key;
    activeAudioChord = chordDisplayName(root, quality);
  }
}

function silenceAll() {
  for (const key of Object.keys(instruments)) {
    const set = instruments[key];
    if (set.chord) set.chord.releaseAll();
    if (set.arp) set.arp.releaseAll();
  }
  previousChordKey = null;
  activeAudioChord = null;
}

function setTimbre(preset) {
  const bank = instruments[preset];
  if (!bank) return;

  // Silence ALL instruments across all timbres to prevent stuck notes
  for (const key of Object.keys(instruments)) {
    const set = instruments[key];
    if (set.chord) set.chord.releaseAll();
    if (set.arp) set.arp.releaseAll();
  }

  // Swap active instrument pointers
  chordSampler = bank.chord;
  arpSampler   = bank.arp;
  dsp.timbre   = preset;
  previousChordKey = null;  // force re-trigger on new instrument

  // Re-trigger the current chord on the new instrument immediately
  if (currentRoot && currentRoot !== 'Stop' && currentQuality && audioStarted) {
    triggerChord(currentRoot, currentQuality);
  }
}

// ===================================================================
// 6. SOUND CONTROLS BINDINGS
// ===================================================================

function bindSoundControls() {
  // Timbre buttons
  document.querySelectorAll('.sc-timbre-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sc-timbre-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      setTimbre(btn.dataset.timbre);
    });
  });

  // Autoplay buttons
  document.querySelectorAll('.sc-autoplay-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sc-autoplay-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      autoplayLevel = +btn.dataset.level;
      // Switching density should NOT drop the sustained chord — only reset the
      // arpeggiator. Clear in-flight arp notes and restart the bar counter.
      seqStep = 0;
      if (arpSampler) arpSampler.releaseAll();
      // Force the held chord to re-sound under the new pattern on the next frame.
      previousChordKey = null;
      if (Tone.Transport.state !== 'started') Tone.Transport.start();
    });
  });

  // HP filter
  const hp = document.getElementById('hp-filter');
  hp?.addEventListener('input', () => {
    dsp.hpFreq = +hp.value;
    if (hpFilter) hpFilter.frequency.rampTo(dsp.hpFreq, 0.1);
    document.getElementById('hp-val').textContent = dsp.hpFreq < 1000 ? dsp.hpFreq + 'Hz' : (dsp.hpFreq/1000).toFixed(1) + 'k';
  });

  // LP filter
  const lp = document.getElementById('lp-filter');
  lp?.addEventListener('input', () => {
    dsp.lpFreq = +lp.value;
    if (lpFilter) lpFilter.frequency.rampTo(dsp.lpFreq, 0.1);
    document.getElementById('lp-val').textContent = dsp.lpFreq >= 10000 ? (dsp.lpFreq/1000).toFixed(1)+'k' : (dsp.lpFreq/1000).toFixed(2)+'k';
  });

  // Volume
  const volSlider = document.getElementById('volume-slider');
  volSlider?.addEventListener('input', () => {
    const v = +volSlider.value;
    dsp.volume = v === 0 ? -Infinity : -60 + v * 0.6;
    if (vol) vol.volume.rampTo(dsp.volume, 0.1);
  });

  // Dynamics (velocity)
  const dyn = document.getElementById('dynamics-slider');
  dyn?.addEventListener('input', () => { dsp.velocity = +dyn.value / 100; });

  // Reverb
  const rev = document.getElementById('reverb-slider');
  rev?.addEventListener('input', () => {
    dsp.reverbWet = +rev.value / 100;
    if (reverb) reverb.wet.rampTo(dsp.reverbWet, 0.1);
  });

  // ADSR sliders
  const adsrInputs = { a: 'adsr-a', d: 'adsr-d', s: 'adsr-s', r: 'adsr-r' };
  Object.entries(adsrInputs).forEach(([key, id]) => {
    const el = document.getElementById(id);
    el?.addEventListener('input', () => {
      const v = +el.value;
      if (key === 'a') { dsp.attack = v / 1000; document.getElementById('a-val').textContent = dsp.attack.toFixed(2) + 's'; }
      if (key === 'd') { dsp.decay  = v / 1000; document.getElementById('d-val').textContent = dsp.decay.toFixed(2) + 's'; }
      if (key === 's') { dsp.sustain = v / 100;  document.getElementById('s-val').textContent = v + '%'; }
      if (key === 'r') { dsp.release = v / 1000; document.getElementById('r-val').textContent = dsp.release.toFixed(2) + 's'; }
      // Samplers play recorded audio, so only Attack (bow swell in) and
      // Release (ring-out) apply — Decay/Sustain live inside the recording
      // itself. A + R shape the cello chords; the violins keep their
      // articulate fixed envelope so fast runs never smear.
      if (chordSampler) { chordSampler.attack = dsp.attack; chordSampler.release = dsp.release; }
      drawADSR();
    });
  });

  // Toggle collapse
  document.getElementById('sc-toggle-btn')?.addEventListener('click', () => {
    document.getElementById('sc-body')?.classList.toggle('collapsed');
  });

  // Initial ADSR draw
  adsrCanvas = document.getElementById('adsr-canvas');
  if (adsrCanvas) adsrCtx = adsrCanvas.getContext('2d');
  drawADSR();
}

function drawADSR() {
  if (!adsrCtx) return;
  const c = adsrCanvas, g = adsrCtx;
  const w = c.width, h = c.height;
  g.clearRect(0, 0, w, h);

  const pad = 8;
  const plotW = w - pad * 2, plotH = h - pad * 2;
  const totalTime = dsp.attack + dsp.decay + 0.3 + dsp.release;
  const px = t => pad + (t / totalTime) * plotW;
  const py = v => pad + (1 - v) * plotH;

  g.strokeStyle = 'rgba(255,255,255,0.25)';
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(px(0), py(0));
  g.lineTo(px(dsp.attack), py(1));
  g.lineTo(px(dsp.attack + dsp.decay), py(dsp.sustain));
  g.lineTo(px(dsp.attack + dsp.decay + 0.3), py(dsp.sustain));
  g.lineTo(px(totalTime), py(0));
  g.stroke();

  g.fillStyle = 'rgba(180,160,220,0.08)';
  g.lineTo(px(totalTime), py(0));
  g.lineTo(px(0), py(0));
  g.closePath();
  g.fill();

  g.font = '9px Inter, sans-serif';
  g.fillStyle = 'rgba(255,255,255,0.2)';
  g.textAlign = 'center';
  [
    { t: dsp.attack / 2, label: 'A' },
    { t: dsp.attack + dsp.decay / 2, label: 'D' },
    { t: dsp.attack + dsp.decay + 0.15, label: 'S' },
    { t: dsp.attack + dsp.decay + 0.3 + dsp.release / 2, label: 'R' }
  ].forEach(l => g.fillText(l.label, px(l.t), h - 2));
}

// ===================================================================
// 7. HAND SKELETON RENDERING
// ===================================================================

function scrX(x) { return (1 - x) * canvas.width; }
function scrY(y) { return y * canvas.height; }

function drawSkeleton(lm) {
  ctx.strokeStyle = '#00ff88';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  for (const [a, b] of BONES) {
    ctx.beginPath();
    ctx.moveTo(scrX(lm[a].x), scrY(lm[a].y));
    ctx.lineTo(scrX(lm[b].x), scrY(lm[b].y));
    ctx.stroke();
  }
  for (let i = 0; i < 21; i++) {
    const px = scrX(lm[i].x), py = scrY(lm[i].y);
    const tip = (i===4||i===8||i===12||i===16||i===20);
    ctx.fillStyle = 'rgba(0,255,136,0.25)';
    ctx.beginPath(); ctx.arc(px, py, tip?14:9, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#00ff88';
    ctx.beginPath(); ctx.arc(px, py, tip?6:4, 0, Math.PI*2); ctx.fill();
  }
}

/** Draw a small dot where the right hand index finger is pointing */
function drawPointerDot(lm) {
  const px = scrX(lm[LM.INDEX_TIP].x);
  const py = scrY(lm[LM.INDEX_TIP].y);
  // Outer glow
  ctx.fillStyle = 'rgba(180,160,255,0.2)';
  ctx.beginPath(); ctx.arc(px, py, 18, 0, Math.PI * 2); ctx.fill();
  // Core
  ctx.fillStyle = 'rgba(180,160,255,0.6)';
  ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2); ctx.fill();
}

// ===================================================================
// 8. UI UPDATES
// ===================================================================

function updateLeftPanel(note) {
  document.querySelectorAll('.gesture-card').forEach(c => {
    c.classList.toggle('active', c.dataset.note === note);
  });
}

function updateRightPanel(quality) {
  document.querySelectorAll('.orbital-node').forEach(n => {
    n.classList.toggle('active', n.dataset.quality === quality);
  });
}

function updateChordDisplay(root, quality) {
  const el = document.getElementById('chord-display');
  if (!el) return;
  const name = chordDisplayName(root, quality);
  el.textContent = name;
  el.classList.toggle('active', name !== '—');
}

// ===================================================================
// 9. MEDIAPIPE onResults — MAIN FRAME HANDLER
// ===================================================================

function onResults(results) {
  const now = performance.now();

  // ── Draw video (mirrored) ──
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.scale(-1, 1);
  ctx.drawImage(videoEl, -canvas.width, 0, canvas.width, canvas.height);
  ctx.restore();
  ctx.fillStyle = 'rgba(8,8,14,0.32)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // ── Process hands — strict separation ──
  let rawRoot = null, rawQuality = null;
  let rightHandLm = null;

  if (results.multiHandLandmarks && results.multiHandedness) {
    for (let i = 0; i < results.multiHandLandmarks.length; i++) {
      const lm = results.multiHandLandmarks[i];
      const info = results.multiHandedness[i];

      drawSkeleton(lm);

      // MediaPipe labels from camera's perspective (mirrored from user's).
      // Camera "Right" = user's LEFT hand,  Camera "Left" = user's RIGHT hand.
      if (info.label === 'Right') {
        rawRoot = detectLeftGesture(lm, 'Left');
      } else if (info.label === 'Left') {
        rawQuality = detectRightHandPointing(lm, 'Right');
        rightHandLm = lm;
      }
    }
  }

  // Draw pointer dot on right hand when pointing
  if (rightHandLm && rawQuality) {
    drawPointerDot(rightHandLm);
  }

  // ── Debounce root note ──
  if (rawRoot !== lastRawRoot) { lastRawRoot = rawRoot; rootSince = now; }
  if (now - rootSince >= DEBOUNCE_ROOT_MS) {
    if (rawRoot !== stableRoot) stableRoot = rawRoot;
  }

  // ── Debounce quality (STICKY: retains last selection when hand not pointing) ──
  if (rawQuality !== null) {
    if (rawQuality !== lastRawQuality) { lastRawQuality = rawQuality; qualitySince = now; }
    if (now - qualitySince >= DEBOUNCE_QUALITY_MS) {
      if (rawQuality !== stableQuality) stableQuality = rawQuality;
    }
  }

  currentRoot = stableRoot;
  currentQuality = stableQuality;

  // ── Update UI ──
  updateLeftPanel(currentRoot);
  updateRightPanel(currentQuality);
  updateChordDisplay(currentRoot, currentQuality);

  // ── Audio ──
  if (currentRoot && currentRoot !== 'Stop' && currentQuality && audioStarted) {
    triggerChord(currentRoot, currentQuality);
  } else if (currentRoot === 'Stop') {
    silenceAll();
  } else if (!currentRoot) {
    silenceAll();
  }
}

// ===================================================================
// 10. INIT
// ===================================================================

function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }

function startCamera() {
  const mpHands = new Hands({
    locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`
  });
  mpHands.setOptions({ maxNumHands: 2, modelComplexity: 1, minDetectionConfidence: 0.7, minTrackingConfidence: 0.5 });
  mpHands.onResults(onResults);
  const cam = new Camera(videoEl, {
    onFrame: async () => { await mpHands.send({ image: videoEl }); },
    width: 1280, height: 720
  });
  cam.start();
}

(function init() {
  resize();
  window.addEventListener('resize', resize);
  initAudio();
  bindSoundControls();
  updateRightPanel('Major');

  // While the violin/cello samples download, tell the user what's happening.
  // onSamplerLoaded() switches this back to "Tap anywhere to begin" once
  // both sections are fully loaded and the engine is armed.
  const sub = document.querySelector('.overlay-subtitle');
  if (sub && !samplersLoaded) sub.textContent = 'Loading string samples…';

  const overlay = document.getElementById('start-overlay');
  const begin = async () => {
    if (audioStarted) return;
    // Mark started + dismiss the overlay FIRST. Everything after this point
    // is wrapped so that a slow/failed audio-context resume, reverb render,
    // or camera permission can never trap the user on the start screen.
    audioStarted = true;
    overlay.classList.add('hidden');

    try {
      await Tone.start();          // resume the AudioContext (needs the tap)
      Tone.Transport.start();      // start the arpeggiator clock
    } catch (e) {
      console.error('Audio failed to start:', e);
    }

    try {
      startCamera();               // request webcam + start hand tracking
    } catch (e) {
      console.error('Camera failed to start:', e);
    }
  };
  overlay.addEventListener('click', begin);
  overlay.addEventListener('touchstart', begin, { passive: true });
})();
