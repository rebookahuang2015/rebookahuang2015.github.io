
    window.onerror = function(message, source, lineno, colno, error) {
      alert(`JS Error: ${message}\nLine: ${lineno}:${colno}\nSource: ${source}`);
      return false;
    };
    window.onunhandledrejection = function(event) {
      alert(`Unhandled Promise Rejection: ${event.reason}`);
    };

    // ===================================================================
    // 1. CONSTANTS & MAPPINGS
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

    // Harmony relationships (matching root+quality combinations)
    const HARMONIOUS_PAIRS = {
      'C+Am':   '♥ vi chord (Relative Minor)',
      'C+Em':   '♥ iii chord (Mediant Minor)',
      'C+G':    '♥ V chord (Perfect Fifth)',
      'G+Em':   '♥ vi chord (Relative Minor)',
      'Am+F':   '♥ IV chord (Subdominant)',
      'Am+Em':  '♥ v chord (Minor Dominant)',
      'F+C':    '♥ IV–I (Plagal Cadence)',
      'G+Am':   '♥ V–vi (Deceptive Resolution)',
      'D+Bm':   '♥ vi chord (Relative Minor)',
      'A+D':    '♥ IV chord (Perfect Fourth)',
      'E+Am':   '♥ V–i (Authentic Cadence)',
    };

    const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    const TOP_BAR_LABELS = ['C','D','E','F','G','A','B','Stop'];
    const BAR_H = 54;
    const BAR_PAD = 6;

    // ===================================================================
    // 2. STATE & AUDIO STUFF
    // ===================================================================
    let audioStarted = false;
    let seqLoop = null;
    let seqStep = 0;

    // Mode Selector & Sound Tabs
    let playMode = 'single'; // 'single' or 'duo'
    let currentTabPlayer = 1; // 1 or 2

    // Independent Player 1 debounces (Root & Quality)
    let p1LastRawRoot = null, p1RootSince = 0, p1StableRoot = null;
    let p1LastRawQuality = null, p1QualitySince = 0, p1StableQuality = 'Major';

    // Independent Player 2 debounces (Root & Quality)
    let p2LastRawRoot = null, p2RootSince = 0, p2StableRoot = null;
    let p2LastRawQuality = null, p2QualitySince = 0, p2StableQuality = 'Major';

    const DEBOUNCE_ROOT_MS = 180;
    const DEBOUNCE_QUALITY_MS = 120;
    const POINT_HIT_RADIUS = 90;

    // Session Scoreboard stats
    let p1ChordsCount = 0;
    let p2ChordsCount = 0;
    let togetherHarmoniesCount = 0;
    let lastTrackedP1Chord = null;
    let lastTrackedP2Chord = null;
    let lastTrackedHarmony = null;

    // Active chord tracking keys (to prevent redundant triggers)
    let p1PrevChordKey = null;
    let p2PrevChordKey = null;
    let lastVfxComboKey = null;

    // Mouse / touch manual controls
    let mouseX = 0, mouseY = 0;
    let manualOverride = null;
    let manualOverrideTimeout = null;

    // FPS
    let frameTick = 0;
    let fpsLastSec = performance.now();
    let fps = 0;
    let maxHandsSetting = 4; // Track all 4 hands for two players
    let showPerfWarning = false;

    // Tone.js Instrument banks & routing
    let p1ChordActive = null, p1ArpActive = null;
    let p2ChordActive = null, p2ArpActive = null;
    let reverb = null, vol = null;

    // Independent Player Signal Chain Nodes
    let p1Panner = null, p1HpFilter = null, p1LpFilter = null, p1VolumeNode = null;
    let p2Panner = null, p2HpFilter = null, p2LpFilter = null, p2VolumeNode = null;

    const p1Instruments = { strings: { chord: null, arp: null }, synth: { chord: null, arp: null }, woodwind: { chord: null, arp: null } };
    const p2Instruments = { strings: { chord: null, arp: null }, synth: { chord: null, arp: null }, woodwind: { chord: null, arp: null } };

    let samplersLoaded = false;
    let samplersLoadedCount = 0;

    // Independent Player 1 settings
    const p1Dsp = {
      attack: 0.08, decay: 0.3, sustain: 0.5, release: 1.0,
      hpFreq: 20, lpFreq: 20000,
      volume: -6, velocity: 0.55,
      timbre: 'strings',
      autoplayLevel: 0
    };

    // Independent Player 2 settings
    const p2Dsp = {
      attack: 0.08, decay: 0.3, sustain: 0.5, release: 1.0,
      hpFreq: 20, lpFreq: 20000,
      volume: -6, velocity: 0.55,
      timbre: 'strings',
      autoplayLevel: 0
    };

    let reverbWet = 0.3;
    let masterVolume = -6; // global trim dB

    // ADSR graph canvas
    let adsrCanvas = null, adsrCtx = null;

    // Screen canvases
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    const videoEl = document.getElementById('webcam');

    // Cello / Violin local samples mapping (same as original)
    const SAMPLE_BASE = 'samples/';
    const CELLO_URLS = {
      'C2':'C2.mp3','E2':'E2.mp3','G2':'G2.mp3','A2':'A2.mp3',
      'C3':'C3.mp3','E3':'E3.mp3','G3':'G3.mp3','A3':'A3.mp3',
      'C4':'C4.mp3','E4':'E4.mp3','G4':'G4.mp3','A4':'A4.mp3'
    };
    const VIOLIN_URLS = {
      'A3':'A3.mp3','C4':'C4.mp3','E4':'E4.mp3','G4':'G4.mp3',
      'A4':'A4.mp3','C5':'C5.mp3','E5':'E5.mp3','G5':'G5.mp3',
      'A5':'A5.mp3','C6':'C6.mp3','E6':'E6.mp3','G6':'G6.mp3'
    };

    // ===================================================================
    // 3. FINGER STATE CALCULATION
    // ===================================================================
    function d(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
    function scrX(x) { return (1 - x) * canvas.width; }
    function scrY(y) { return y * canvas.height; }

    function fingerExtended(lm, tip, pip) {
      const w = lm[LM.WRIST];
      const dTip = Math.hypot(lm[tip].x - w.x, lm[tip].y - w.y);
      const dPip = Math.hypot(lm[pip].x - w.x, lm[pip].y - w.y);
      return dTip > dPip * 1.05;
    }

    function fingerCurled(lm, tip, pip) { return !fingerExtended(lm, tip, pip); }

    function thumbOut(lm, label) {
      const tip = lm[LM.THUMB_TIP], ip = lm[LM.THUMB_IP];
      return label === 'Left' ? (tip.x > ip.x + 0.015) : (tip.x < ip.x - 0.015);
    }

    function getFingerBits(lm, label) {
      const idxE = fingerExtended(lm, LM.INDEX_TIP, LM.INDEX_PIP) ? 1 : 0;
      const midE = fingerExtended(lm, LM.MIDDLE_TIP, LM.MIDDLE_PIP) ? 1 : 0;
      const rngE = fingerExtended(lm, LM.RING_TIP, LM.RING_PIP) ? 1 : 0;
      const pnkE = fingerExtended(lm, LM.PINKY_TIP, LM.PINKY_PIP) ? 1 : 0;

      const thmE = thumbOut(lm, label);
      const handScale = d(lm[LM.WRIST], lm[LM.MIDDLE_MCP]);
      const scale = handScale > 0.01 ? handScale : 1.0;
      const thumbWide = (d(lm[LM.THUMB_TIP], lm[LM.INDEX_MCP]) / scale) > 0.65;
      const tE = (thmE || thumbWide) ? 1 : 0;

      return [tE, idxE, midE, rngE, pnkE];
    }

    // ===================================================================
    // 4. CHORD LOOKUP & PARCELLING
    // ===================================================================
    function partitionHands(results) {
      const p1Hands = [];
      const p2Hands = [];
      const p1Handedness = [];
      const p2Handedness = [];

      if (results.multiHandLandmarks && results.multiHandedness) {
        for (const [i, landmarks] of results.multiHandLandmarks.entries()) {
          const wristX = landmarks[0].x;
          const info = results.multiHandedness[i];
          // Raw wristX >= 0.5 is left side of mirrored screen (Player 1)
          // Raw wristX < 0.5 is right side of mirrored screen (Player 2)
          if (wristX >= 0.5) {
            p1Hands.push(landmarks);
            p1Handedness.push(info);
          } else {
            p2Hands.push(landmarks);
            p2Handedness.push(info);
          }
        }
      }
      return { p1Hands, p1Handedness, p2Hands, p2Handedness };
    }

    function d(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
    function scrX(x) { return (1 - x) * canvas.width; }
    function scrY(y) { return y * canvas.height; }

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
      return label === 'Left' ? (tip.x > ip.x + 0.015) : (tip.x < ip.x - 0.015);
    }

    // Strict Left-Hand Gesture detection (returns C, D, E, F, G, A, B, or Stop)
    function detectLeftGesture(lm, label) {
      const idxE = fingerExtended(lm, LM.INDEX_TIP, LM.INDEX_PIP);
      const midE = fingerExtended(lm, LM.MIDDLE_TIP, LM.MIDDLE_PIP);
      const rngE = fingerExtended(lm, LM.RING_TIP, LM.RING_PIP);
      const pnkE = fingerExtended(lm, LM.PINKY_TIP, LM.PINKY_PIP);
      const thmE = thumbOut(lm, label);

      const midC = !midE, rngC = !rngE, pnkC = !pnkE;

      const handScale = d(lm[LM.WRIST], lm[LM.MIDDLE_MCP]);
      const scale = handScale > 0.01 ? handScale : 1.0;

      // 0. 🤌 C5 — Pinch: all 5 finger tips touching together
      const t_i = d(lm[LM.THUMB_TIP], lm[LM.INDEX_TIP]) / scale;
      const t_m = d(lm[LM.THUMB_TIP], lm[LM.MIDDLE_TIP]) / scale;
      const t_r = d(lm[LM.THUMB_TIP], lm[LM.RING_TIP]) / scale;
      const t_p = d(lm[LM.THUMB_TIP], lm[LM.PINKY_TIP]) / scale;
      if (t_i < 0.42 && t_m < 0.42 && t_r < 0.42 && t_p < 0.42) return 'C5';

      const thumbIdxDistNorm = d(lm[LM.THUMB_TIP], lm[LM.INDEX_TIP]) / scale;
      const idxTipToMCPNorm = d(lm[LM.INDEX_TIP], lm[LM.INDEX_MCP]) / scale;
      const thumbIdxMCPDistNorm = d(lm[LM.THUMB_TIP], lm[LM.INDEX_MCP]) / scale;

      // 1. 👌 E — OK hand: thumb+index touching, others EXTENDED
      if (thumbIdxDistNorm < 0.5 && midE && rngE && pnkE) return 'E';

      // 2. 🫰 C — Finger heart: thumb+index touching, others CURLED
      if (thumbIdxDistNorm < 0.5 && midC && rngC && pnkC && idxTipToMCPNorm > 0.4) return 'C';

      // 3. 👊 Stop — Fist: all fingers curled tightly
      if (!idxE && midC && rngC && pnkC && idxTipToMCPNorm <= 0.4) return 'Stop';

      // 4. 🤟 F — ILY: thumb+index+pinky extended, middle+ring curled
      if (thmE && idxE && pnkE && midC && rngC) return 'F';

      // 5. 🤙 A — Shaka: thumb+pinky extended, index/mid/ring curled
      const thumbWide = thumbIdxMCPDistNorm > 0.65;
      if ((thmE || thumbWide) && pnkE && !idxE && midC && rngC) return 'A';

      // 6. ✌️ D — Peace: index+middle extended, ring+pinky curled
      if (idxE && midE && rngC && pnkC) return 'D';

      // 7. ☝️ B — Point up: only index extended, index and thumb not touching
      if (idxE && midC && rngC && pnkC && thumbIdxDistNorm > 0.55) return 'B';

      // 8. ✋ G — Open palm: all 4 fingers extended
      if (idxE && midE && rngE && pnkE) return 'G';

      return null;
    }

    // Right-Hand pointing hit test against player's orbital nodes
    function detectRightHandPointingForPlayer(lm, playerNum) {
      const idxE = fingerExtended(lm, LM.INDEX_TIP, LM.INDEX_PIP);
      const midC = fingerCurled(lm, LM.MIDDLE_TIP, LM.MIDDLE_PIP);
      const rngC = fingerCurled(lm, LM.RING_TIP, LM.RING_PIP);
      const pnkC = fingerCurled(lm, LM.PINKY_TIP, LM.PINKY_PIP);

      if (!idxE || !midC || !rngC || !pnkC) return null;

      const tipX = (1 - lm[LM.INDEX_TIP].x) * canvas.width;
      const tipY = lm[LM.INDEX_TIP].y * canvas.height;

      const selector = playerNum === 1 ? '#p1-right-panel .orbital-node' : '#p2-right-panel .orbital-node';
      const nodes = document.querySelectorAll(selector);
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

      return (closestDist <= POINT_HIT_RADIUS) ? closest : null;
    }

    function checkHarmony(c1, c2) {
      if (!c1 || c1 === '—' || !c2 || c2 === '—') return null;
      const key1 = c1 + '+' + c2;
      const key2 = c2 + '+' + c1;
      return HARMONIOUS_PAIRS[key1] || HARMONIOUS_PAIRS[key2] || null;
    }

    // ===================================================================
    // 5. AUDIO SYSTEM IMPLEMENTATION
    // ===================================================================
    function midiToNote(m) {
      return NOTE_NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
    }

    const CHORD_CENTER = 60;    // C4 reference
    const BASS_MIDI_BASE = 36;  // C2 reference

    function nearestOctave(pc, ref, lo = 36, hi = 96) {
      let best = pc, bestDist = Infinity;
      for (let m = pc; m <= hi; m += 12) {
        if (m < lo) continue;
        const dist = Math.abs(m - ref);
        if (dist < bestDist) { bestDist = dist; best = m; }
      }
      return best;
    }

    // Voice block chord dynamically based on root and quality intervals
    function voiceBlockChord(root, quality) {
      if (!root || root === 'Stop' || !quality) return null;
      let ri = NOTE_NAMES.indexOf(root);
      let octaveOffset = 0;
      if (root === 'C5') {
        ri = 0;
        octaveOffset = 12;
      }
      const iv = QUALITY_INTERVALS[quality];
      if (ri < 0 || !iv) return null;

      const bass = midiToNote((ri % 12) + BASS_MIDI_BASE + octaveOffset);
      const body = iv.map(interval => {
        const pc = (ri + interval) % 12;
        return midiToNote(nearestOctave(pc, CHORD_CENTER + octaveOffset, 52 + octaveOffset, 76 + octaveOffset));
      });
      return [bass, ...body];
    }

    // Build arpeggiator ascending note pool dynamically
    function buildArpPool(root, quality) {
      if (!root || root === 'Stop' || !quality) return null;
      let ri = NOTE_NAMES.indexOf(root);
      let octaveOffset = 0;
      if (root === 'C5') {
        ri = 0;
        octaveOffset = 12;
      }
      const base = QUALITY_INTERVALS[quality];
      if (ri < 0 || !base) return null;

      const intervals = new Set(base);
      intervals.add(14); // 9th for shimmer
      if (base.length === 3 && quality !== 'Dim') {
        const isMinor = base.includes(3);
        intervals.add(isMinor ? 10 : 11); // color 7th on bare triads
      }
      const sorted = [...intervals].sort((a, b) => a - b);

      const rootMidi = ri + 60 + octaveOffset;
      const pool = [];
      for (const octave of [0, 12]) {
        for (const iv of sorted) pool.push(rootMidi + octave + iv);
      }
      return pool.map(midiToNote);
    }

    function chordDisplayName(root, quality) {
      if (!root || root === 'Stop' || !quality) return '—';
      const rootLabel = root === 'C5' ? 'C (8va)' : root;
      const m = { Major:'', Minor:'m', Maj7:'Maj7', Min7:'m7', Dom7:'7', Dim:'dim', Sus4:'sus4', Sus2:'sus2' };
      return rootLabel + (m[quality] ?? quality);
    }

    function onSamplerLoaded(which) {
      samplersLoadedCount++;
      console.log(`[samples] ${which} section loaded (${samplersLoadedCount}/4)`);
      if (samplersLoadedCount >= 4) {
        samplersLoaded = true;
        const sub = document.querySelector('.overlay-subtitle');
        if (sub) sub.textContent = 'Tap anywhere to begin';
      }
    }

    function initAudio() {
      // ── Shared Bus ──
      reverb  = new Tone.Reverb({ decay: 2.2, wet: reverbWet, preDelay: 0.01 });
      vol     = new Tone.Volume(masterVolume);
      reverb.chain(vol, Tone.Destination);

      // ── Player 1 Routing ──
      p1HpFilter = new Tone.Filter({ frequency: p1Dsp.hpFreq, type: 'highpass', rolloff: -12 });
      p1LpFilter = new Tone.Filter({ frequency: p1Dsp.lpFreq, type: 'lowpass', rolloff: -12 });
      p1VolumeNode = new Tone.Volume(p1Dsp.volume);
      p1Panner = new Tone.Panner(-0.4);

      p1Panner.chain(p1HpFilter, p1LpFilter, p1VolumeNode, reverb);

      // ── Player 2 Routing ──
      p2HpFilter = new Tone.Filter({ frequency: p2Dsp.hpFreq, type: 'highpass', rolloff: -12 });
      p2LpFilter = new Tone.Filter({ frequency: p2Dsp.lpFreq, type: 'lowpass', rolloff: -12 });
      p2VolumeNode = new Tone.Volume(p2Dsp.volume);
      p2Panner = new Tone.Panner(0.4);

      p2Panner.chain(p2HpFilter, p2LpFilter, p2VolumeNode, reverb);

      // ── Player 1 Instrument Bank ──
      p1Instruments.strings.chord = new Tone.Sampler({
        urls: CELLO_URLS, baseUrl: SAMPLE_BASE + 'cello/',
        attack: 0.25, release: 1.2, volume: 0,
        onload: () => onSamplerLoaded('cello-p1')
      }).connect(p1Panner);
      p1Instruments.strings.arp = new Tone.Sampler({
        urls: VIOLIN_URLS, baseUrl: SAMPLE_BASE + 'violin/',
        attack: 0.03, release: 0.6, volume: -2,
        onload: () => onSamplerLoaded('violin-p1')
      }).connect(p1Panner);

      p1Instruments.synth.chord = new Tone.PolySynth(Tone.FMSynth, {
        maxPolyphony: 8, harmonicity: 3.01, modulationIndex: 1.5,
        oscillator: { type: 'sine' }, modulation: { type: 'triangle' },
        envelope: { attack: 0.06, decay: 0.8, sustain: 0.4, release: 1.5 },
        volume: -6
      }).connect(p1Panner);
      p1Instruments.synth.arp = new Tone.PolySynth(Tone.FMSynth, {
        maxPolyphony: 8, harmonicity: 2.0, modulationIndex: 2.5,
        oscillator: { type: 'sine' }, modulation: { type: 'sine' },
        envelope: { attack: 0.01, decay: 0.35, sustain: 0.15, release: 0.5 },
        volume: -8
      }).connect(p1Panner);

      p1Instruments.woodwind.chord = new Tone.PolySynth(Tone.FMSynth, {
        maxPolyphony: 8, harmonicity: 1.0, modulationIndex: 4.0,
        oscillator: { type: 'sine' }, modulation: { type: 'square' },
        envelope: { attack: 0.12, decay: 0.6, sustain: 0.5, release: 1.0 },
        volume: -5
      }).connect(p1Panner);
      p1Instruments.woodwind.arp = new Tone.PolySynth(Tone.FMSynth, {
        maxPolyphony: 8, harmonicity: 1.5, modulationIndex: 5.0,
        oscillator: { type: 'sine' }, modulation: { type: 'square' },
        envelope: { attack: 0.02, decay: 0.25, sustain: 0.2, release: 0.4 },
        volume: -7
      }).connect(p1Panner);

      // ── Player 2 Instrument Bank ──
      p2Instruments.strings.chord = new Tone.Sampler({
        urls: CELLO_URLS, baseUrl: SAMPLE_BASE + 'cello/',
        attack: 0.25, release: 1.2, volume: 0,
        onload: () => onSamplerLoaded('cello-p2')
      }).connect(p2Panner);
      p2Instruments.strings.arp = new Tone.Sampler({
        urls: VIOLIN_URLS, baseUrl: SAMPLE_BASE + 'violin/',
        attack: 0.03, release: 0.6, volume: -2,
        onload: () => onSamplerLoaded('violin-p2')
      }).connect(p2Panner);

      p2Instruments.synth.chord = new Tone.PolySynth(Tone.FMSynth, {
        maxPolyphony: 8, harmonicity: 3.01, modulationIndex: 1.5,
        oscillator: { type: 'sine' }, modulation: { type: 'triangle' },
        envelope: { attack: 0.06, decay: 0.8, sustain: 0.4, release: 1.5 },
        volume: -6
      }).connect(p2Panner);
      p2Instruments.synth.arp = new Tone.PolySynth(Tone.FMSynth, {
        maxPolyphony: 8, harmonicity: 2.0, modulationIndex: 2.5,
        oscillator: { type: 'sine' }, modulation: { type: 'sine' },
        envelope: { attack: 0.01, decay: 0.35, sustain: 0.15, release: 0.5 },
        volume: -8
      }).connect(p2Panner);

      p2Instruments.woodwind.chord = new Tone.PolySynth(Tone.FMSynth, {
        maxPolyphony: 8, harmonicity: 1.0, modulationIndex: 4.0,
        oscillator: { type: 'sine' }, modulation: { type: 'square' },
        envelope: { attack: 0.12, decay: 0.6, sustain: 0.5, release: 1.0 },
        volume: -5
      }).connect(p2Panner);
      p2Instruments.woodwind.arp = new Tone.PolySynth(Tone.FMSynth, {
        maxPolyphony: 8, harmonicity: 1.5, modulationIndex: 5.0,
        oscillator: { type: 'sine' }, modulation: { type: 'square' },
        envelope: { attack: 0.02, decay: 0.25, sustain: 0.2, release: 0.4 },
        volume: -7
      }).connect(p2Panner);

      setTimbre(1, p1Dsp.timbre);
      setTimbre(2, p2Dsp.timbre);

      // 16th-note clock arpeggiator sequencer
      Tone.Transport.bpm.value = 100;
      seqLoop = new Tone.Loop(time => runSequencerStep(time), "16n").start(0);
    }

    function setTimbre(playerNum, preset) {
      if (playerNum === 1) {
        if (p1ChordActive) p1ChordActive.releaseAll();
        if (p1ArpActive) p1ArpActive.releaseAll();
        p1ChordActive = p1Instruments[preset].chord;
        p1ArpActive   = p1Instruments[preset].arp;
        p1Dsp.timbre = preset;
        p1PrevChordKey = null;
        if (p1StableRoot && p1StableRoot !== 'Stop') {
          const voicedP1 = voiceBlockChord(p1StableRoot, p1StableQuality);
          triggerChordP1(voicedP1);
        }
      } else {
        if (p2ChordActive) p2ChordActive.releaseAll();
        if (p2ArpActive) p2ArpActive.releaseAll();
        p2ChordActive = p2Instruments[preset].chord;
        p2ArpActive   = p2Instruments[preset].arp;
        p2Dsp.timbre = preset;
        p2PrevChordKey = null;
        if (p2StableRoot && p2StableRoot !== 'Stop') {
          const voicedP2 = voiceBlockChord(p2StableRoot, p2StableQuality);
          triggerChordP2(voicedP2);
        }
      }
    }

    function updatePlayerEnvelope(playerNum) {
      const dsp = playerNum === 1 ? p1Dsp : p2Dsp;
      const env = { attack: dsp.attack, decay: dsp.decay, sustain: dsp.sustain, release: dsp.release };
      const instruments = playerNum === 1 ? p1Instruments : p2Instruments;

      for (const p of ['strings', 'synth', 'woodwind']) {
        const inst = instruments[p];
        if (!inst) continue;
        if (p === 'strings') {
          if (inst.chord) { inst.chord.attack = dsp.attack; inst.chord.release = dsp.release; }
          if (inst.arp) { inst.arp.attack = dsp.attack; inst.arp.release = dsp.release; }
        } else {
          if (inst.chord) inst.chord.set({ envelope: env });
          if (inst.arp) inst.arp.set({ envelope: env });
        }
      }
    }

    // Sync sound control sliders and buttons with currently active player tab state
    function updateSoundControlsUI() {
      const dsp = currentTabPlayer === 1 ? p1Dsp : p2Dsp;

      // 1. Timbre buttons
      document.querySelectorAll('.sc-timbre-btn').forEach(btn => {
        if (btn.dataset.timbre === dsp.timbre) btn.classList.add('active');
        else btn.classList.remove('active');
      });

      // 2. Autoplay buttons
      document.querySelectorAll('.sc-autoplay-btn').forEach(btn => {
        if (+btn.dataset.level === dsp.autoplayLevel) btn.classList.add('active');
        else btn.classList.remove('active');
      });

      // 3. Slider values
      const hpInput = document.getElementById('hp-filter');
      if (hpInput) {
        hpInput.value = dsp.hpFreq;
        document.getElementById('hp-val').textContent = dsp.hpFreq < 1000 ? dsp.hpFreq + 'Hz' : (dsp.hpFreq/1000).toFixed(1) + 'k';
      }

      const lpInput = document.getElementById('lp-filter');
      if (lpInput) {
        lpInput.value = dsp.lpFreq;
        document.getElementById('lp-val').textContent = dsp.lpFreq >= 10000 ? (dsp.lpFreq/1000).toFixed(1)+'k' : (dsp.lpFreq/1000).toFixed(2)+'k';
      }

      const volInput = document.getElementById('volume-slider');
      if (volInput) {
        const sliderVal = dsp.volume === -Infinity ? 0 : Math.round((dsp.volume + 60) / 0.6);
        volInput.value = sliderVal;
      }

      const dynInput = document.getElementById('dynamics-slider');
      if (dynInput) {
        dynInput.value = Math.round(dsp.velocity * 100);
      }

      // 4. ADSR slider values
      const aSlider = document.getElementById('adsr-a');
      if (aSlider) {
        aSlider.value = Math.round(dsp.attack * 1000);
        document.getElementById('a-val').textContent = dsp.attack.toFixed(2) + 's';
      }
      const dSlider = document.getElementById('adsr-d');
      if (dSlider) {
        dSlider.value = Math.round(dsp.decay * 1000);
        document.getElementById('d-val').textContent = dsp.decay.toFixed(2) + 's';
      }
      const sSlider = document.getElementById('adsr-s');
      if (sSlider) {
        sSlider.value = Math.round(dsp.sustain * 100);
        document.getElementById('s-val').textContent = Math.round(dsp.sustain * 100) + '%';
      }
      const rSlider = document.getElementById('adsr-r');
      if (rSlider) {
        rSlider.value = Math.round(dsp.release * 1000);
        document.getElementById('r-val').textContent = dsp.release.toFixed(2) + 's';
      }

      // 5. Active tab styles
      const tab1 = document.getElementById('sc-tab-p1');
      const tab2 = document.getElementById('sc-tab-p2');
      if (currentTabPlayer === 1) {
        tab1.classList.add('active');
        tab2.classList.remove('active');
      } else {
        tab1.classList.remove('active');
        tab2.classList.add('active');
      }

      drawADSR();
    }

    function triggerChordP1(notes) {
      if (!p1ChordActive || !audioStarted) return;
      if (p1Dsp.timbre === 'strings' && !samplersLoaded) return;

      p1ChordActive.releaseAll();
      if (!notes || notes.length === 0) return;

      const vel = p1Dsp.velocity;
      notes.forEach(note => {
        p1ChordActive.triggerAttack(note, Tone.now(), vel);
      });
    }

    function triggerChordP2(notes) {
      if (!p2ChordActive || !audioStarted) return;
      if (p2Dsp.timbre === 'strings' && !samplersLoaded) return;

      p2ChordActive.releaseAll();
      if (!notes || notes.length === 0) return;

      const vel = p2Dsp.velocity;
      notes.forEach(note => {
        p2ChordActive.triggerAttack(note, Tone.now(), vel);
      });
    }

    function silenceAll() {
      for (const set of [p1Instruments, p2Instruments]) {
        for (const key of Object.keys(set)) {
          const inst = set[key];
          if (inst.chord) inst.chord.releaseAll();
          if (inst.arp) inst.arp.releaseAll();
        }
      }
      p1PrevChordKey = null;
      p2PrevChordKey = null;
    }

    // ===================================================================
    // 6. ARPEGGIATOR / SEQUENCER
    // ===================================================================
    function runSequencerStep(time) {
      if (!audioStarted) { seqStep = 0; return; }

      const step = seqStep;
      seqStep = (seqStep + 1) % 16;

      // Player 1 Arpeggiator
      if (p1StableRoot && p1StableRoot !== 'Stop' && p1StableQuality && p1Dsp.autoplayLevel > 0) {
        if (!(p1Dsp.timbre === 'strings' && !samplersLoaded)) {
          const pool = buildArpPool(p1StableRoot, p1StableQuality);
          if (pool && pool.length) triggerArpNote(1, pool, step, time);
        }
      }

      // Player 2 Arpeggiator (Duo mode only)
      if (playMode === 'duo' && p2StableRoot && p2StableRoot !== 'Stop' && p2StableQuality && p2Dsp.autoplayLevel > 0) {
        if (!(p2Dsp.timbre === 'strings' && !samplersLoaded)) {
          const pool = buildArpPool(p2StableRoot, p2StableQuality);
          if (pool && pool.length) triggerArpNote(2, pool, step, time);
        }
      }
    }

    function triggerArpNote(playerNum, pool, step, time) {
      const dsp = playerNum === 1 ? p1Dsp : p2Dsp;
      const arpActive = playerNum === 1 ? p1ArpActive : p2ArpActive;
      if (!arpActive) return;

      const n = pool.length;
      const v = dsp.velocity;
      const autoplayLevel = dsp.autoplayLevel;

      if (autoplayLevel === 1) {
        if (step % 4 === 0) {
          const beat = (step / 4) % 4;
          const spreadIdx = [
            0,
            Math.max(1, Math.floor(n / 4)),
            Math.floor(n / 2),
            Math.min(n - 1, Math.floor(n * 3 / 4))
          ];
          const idx = spreadIdx[beat] % n;
          arpActive.triggerAttackRelease(pool[idx], "4n", time, v * 0.9);
        }
      } else if (autoplayLevel === 2) {
        if (step % 2 === 0) {
          const contour = [0, 1, 2, 3, 4, 3, 2, 1];
          const idx = contour[(step / 2) % contour.length] % n;
          arpActive.triggerAttackRelease(pool[idx], "8n", time, v * 0.85);
        }
      } else if (autoplayLevel === 3) {
        const runMap = {
          0: 0,  1: 2,  2: 4,  3: 5,
          4: 6,         6: 5,  7: 4,
          8: 3,  9: 5, 10: 7, 11: 6,
          12: 4, 13: 6, 14: 8, 15: 7
        };
        if (step in runMap) {
          const idx = runMap[step] % n;
          if (step === 4 || step === 10 || step === 14) {
            const hi = (idx + 2) % n;
            arpActive.triggerAttackRelease([pool[idx], pool[hi]], "16n", time, v * 0.8);
          } else {
            arpActive.triggerAttackRelease(pool[idx], "16n", time, v * 0.9);
          }
        }
      }
    }

    // ===================================================================
    // 7. CANVAS & UI RENDERERS
    // ===================================================================
    function roundRect(x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
    }

    function drawPointerDot(lm, playerColor) {
      const tipX = (1 - lm[LM.INDEX_TIP].x) * canvas.width;
      const tipY = lm[LM.INDEX_TIP].y * canvas.height;
      ctx.fillStyle = playerColor === '#00ff88' ? 'rgba(0, 255, 136, 0.85)' : 'rgba(255, 110, 199, 0.85)';
      ctx.beginPath();
      ctx.arc(tipX, tipY, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(tipX, tipY, 11, 0, Math.PI * 2);
      ctx.stroke();
    }

    function drawSkeleton(lm, playerColor) {
      ctx.strokeStyle = playerColor;
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
        ctx.fillStyle = playerColor === '#00ff88' ? 'rgba(0,255,136,0.25)' : 'rgba(255,110,199,0.25)';
        ctx.beginPath(); ctx.arc(px, py, tip?14:9, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = playerColor;
        ctx.beginPath(); ctx.arc(px, py, tip?6:4, 0, Math.PI*2); ctx.fill();
      }
    }

    function drawFPS() {
      const tx = canvas.width - 20;
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      roundRect(tx - 70, BAR_H + 6, 74, 22, 4);
      ctx.fill();
      ctx.fillStyle = 'rgba(200,200,200,0.75)';
      ctx.font = '12px monospace';
      ctx.textAlign = 'right'; ctx.textBaseline = 'top';
      ctx.fillText(`${fps} FPS`, tx - 4, BAR_H + 10);
    }

    // ===================================================================
    // 7.5 VISUAL EFFECTS LIBRARY (VFX ENGINE)
    // ===================================================================
    // ===================================================================
    // 7.5  VFX WEBGL SHADER SYSTEM
    // All chord-triggered effects run as GLSL fragment shaders on a
    // transparent WebGL overlay canvas. Lifecycle: kill() zeros alpha
    // instantly when chord changes — zero lingering guaranteed.
    // ===================================================================
    const VFXShaderSystem = {
      gl: null,
      canvas: null,
      programs: {},
      quadBuffer: null,
      activeEffect: null,
      effectStartTime: 0,
      effectAlpha: 0,
      shadersReady: false,

      async init() {
        const c = document.createElement('canvas');
        c.id = 'vfx-canvas';
        c.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;pointer-events:none;z-index:20;';
        document.body.appendChild(c);
        c.width  = window.innerWidth;
        c.height = window.innerHeight;
        this.canvas = c;

        const gl = c.getContext('webgl', { alpha: true, premultipliedAlpha: false, antialias: false });
        if (!gl) { console.warn('[VFX] WebGL unavailable'); return; }
        this.gl = gl;
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.viewport(0, 0, c.width, c.height);

        const verts = new Float32Array([-1,-1, 1,-1, -1,1, 1,1]);
        this.quadBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);

        window.addEventListener('resize', () => {
          c.width  = window.innerWidth;
          c.height = window.innerHeight;
          gl.viewport(0, 0, c.width, c.height);
        });

        await this._loadShaders();
        this.shadersReady = true;
        console.log('[VFX] WebGL shader system ready —', Object.keys(this.programs).length, 'effects loaded');
      },

      async _loadShaders() {
        let vertSrc;
        try {
          const r = await fetch('shaders/shared.vert');
          if (!r.ok) throw new Error('HTTP ' + r.status);
          vertSrc = await r.text();
        } catch (e) {
          console.error('[VFX] Could not load shared.vert:', e);
          return;
        }
        const effects = ['heart','firework','rainbow','bioluminescent','tritone','eclipse','yinyang','timefreeze','shatter'];
        for (const name of effects) {
          try {
            const r2 = await fetch('shaders/' + name + '.frag');
            if (!r2.ok) throw new Error('HTTP ' + r2.status);
            const fragSrc = await r2.text();
            const prog = this._compile(vertSrc, fragSrc, name);
            if (prog) this.programs[name] = prog;
          } catch (e) {
            console.warn('[VFX] Could not load shaders/' + name + '.frag:', e);
          }
        }
      },

      _compile(vertSrc, fragSrc, name) {
        const gl = this.gl;
        const mkShader = (type, src) => {
          const s = gl.createShader(type);
          gl.shaderSource(s, src);
          gl.compileShader(s);
          if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
            console.error('[VFX] ' + name + ' shader compile:', gl.getShaderInfoLog(s));
            gl.deleteShader(s);
            return null;
          }
          return s;
        };
        const vs = mkShader(gl.VERTEX_SHADER,   vertSrc);
        const fs = mkShader(gl.FRAGMENT_SHADER, fragSrc);
        if (!vs || !fs) return null;
        const prog = gl.createProgram();
        gl.attachShader(prog, vs);
        gl.attachShader(prog, fs);
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
          console.error('[VFX] ' + name + ' link:', gl.getProgramInfoLog(prog));
          return null;
        }
        return prog;
      },

      trigger(name) {
        if (!this.shadersReady) return;
        this.activeEffect    = name;
        this.effectStartTime = performance.now();
        this.effectAlpha     = 0;
      },

      // INSTANT kill — called the moment chord combo changes
      kill() {
        this.activeEffect = null;
        this.effectAlpha  = 0.0;
        if (this.gl) {
          this.gl.clearColor(0, 0, 0, 0);
          this.gl.clear(this.gl.COLOR_BUFFER_BIT);
        }
      },

      render() {
        const gl = this.gl;
        if (!gl) return;
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        if (!this.activeEffect || !this.shadersReady) return;
        const prog = this.programs[this.activeEffect];
        if (!prog) return;

        const elapsed = (performance.now() - this.effectStartTime) / 1000.0;
        this.effectAlpha = Math.min(1.0, elapsed * 4.0);

        gl.useProgram(prog);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
        const posLoc = gl.getAttribLocation(prog, 'a_position');
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

        gl.uniform2f(gl.getUniformLocation(prog, 'u_resolution'), this.canvas.width, this.canvas.height);
        gl.uniform1f(gl.getUniformLocation(prog, 'u_time'),       elapsed);
        gl.uniform1f(gl.getUniformLocation(prog, 'u_alpha'),      this.effectAlpha);

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
    };

    // ===================================================================
    // 7.6  AMBIENT MIST — lightweight Canvas 2D atmospheric bottom glow
    // ===================================================================
    const AmbientMist = {
      mists: [],
      init() {
        this.mists = [];
        for (let i = 0; i < 14; i++) {
          this.mists.push({
            x: Math.random() * canvas.width,
            y: canvas.height - 40 - Math.random() * 80,
            radius: 120 + Math.random() * 100,
            colorA: i % 2 === 0 ? 'rgba(0,255,136,' : 'rgba(255,110,199,',
            vx: (Math.random() - 0.5) * 0.4,
            vy: (Math.random() - 0.5) * 0.15,
            alpha: 0.10 + Math.random() * 0.05
          });
        }
      },
      update() {
        for (const m of this.mists) {
          m.x += m.vx; m.y += m.vy;
          if (m.x < -m.radius) m.x = canvas.width + m.radius;
          if (m.x > canvas.width + m.radius) m.x = -m.radius;
          if (m.y < canvas.height * 0.6) m.vy =  Math.abs(m.vy);
          if (m.y > canvas.height)       m.vy = -Math.abs(m.vy);
        }
      },
      draw(ctx) {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        for (const m of this.mists) {
          const g = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.radius);
          g.addColorStop(0, m.colorA + m.alpha + ')');
          g.addColorStop(1, m.colorA + '0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(m.x, m.y, m.radius, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    };

    // ===================================================================
    // 7.7  VFX TRIGGER WRAPPERS (thin shims → VFXShaderSystem)
    // ===================================================================
    function trigger_PerfectFifthFirework()        { VFXShaderSystem.trigger('firework');        }
    function trigger_SameChordHeart()              { VFXShaderSystem.trigger('heart');           }
    function trigger_RainbowMajorMinor()           { VFXShaderSystem.trigger('rainbow');         }
    function trigger_EclipseMajorMaj7()            { VFXShaderSystem.trigger('eclipse');         }
    function trigger_BioluminescentStormDom7Min7() { VFXShaderSystem.trigger('bioluminescent');  }
    function trigger_TimeFreezeSus4Sus2()          { VFXShaderSystem.trigger('timefreeze');      }
    function trigger_TritoneGlitchB_F()            { VFXShaderSystem.trigger('tritone');         }
    function trigger_YinYangRootUnity()            { VFXShaderSystem.trigger('yinyang');         }
    function trigger_ShatterMajorSecond()          { VFXShaderSystem.trigger('shatter');         }

        // Update decorative mists drift
        this.mists.forEach(m => {
          m.x += m.vx;
          m.y += m.vy;
          if (m.x < -m.radius) m.x = canvas.width + m.radius;
          if (m.x > canvas.width + m.radius) m.x = -m.radius;
          if (m.y < canvas.height - 180) m.vy = Math.abs(m.vy);
          if (m.y > canvas.height) m.vy = -Math.abs(m.vy);

          // Energize alpha if heavy harmonics are active
          if (this.heartCore.active || this.fifthCore.active || this.eclipse.active || this.rainbow.active) {
            m.targetAlpha = 0.28;
          } else {
            m.targetAlpha = 0.12;
          }
          m.alpha += (m.targetAlpha - m.alpha) * 0.05;
        });
      },

      draw(ctx) {
        const now = performance.now();
        // Draw decorative mist clouds at bottom of screen (screen composite for glowing color-bleeds)
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        this.mists.forEach(m => {
          const grad = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.radius);
          const colorBase = m.color.includes('255, 110') ? '255, 110, 199' : '0, 255, 136';
          grad.addColorStop(0, `rgba(${colorBase}, ${m.alpha})`);
          grad.addColorStop(0.5, `rgba(${colorBase}, ${m.alpha * 0.4})`);
          grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(m.x, m.y, m.radius, 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.restore();

        // 1. Draw Eclipse background totality dimming
        if (this.eclipse.active) {
          const maxDimAlpha = 0.68;
          const alphaVal = this.eclipse.timer < 500 
            ? (this.eclipse.timer / 500) * maxDimAlpha
            : this.eclipse.timer > this.eclipse.maxDuration - 800
              ? ((this.eclipse.maxDuration - this.eclipse.timer) / 800) * maxDimAlpha
              : maxDimAlpha;

          ctx.fillStyle = `rgba(4, 4, 12, ${alphaVal})`;
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          // Draw Eclipse totality ring (crown) in the center stylized sky
          ctx.save();
          ctx.globalCompositeOperation = 'screen';
          const ecx = canvas.width / 2;
          const ecy = canvas.height * 0.35;
          const ringRad = 48;

          // Draw solar corona flares
          const coronaGrad = ctx.createRadialGradient(ecx, ecy, ringRad - 5, ecx, ecy, ringRad + 65);
          coronaGrad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
          coronaGrad.addColorStop(0.1, 'rgba(255, 220, 150, 0.7)');
          coronaGrad.addColorStop(0.4, 'rgba(0, 255, 220, 0.25)');
          coronaGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
          ctx.fillStyle = coronaGrad;
          ctx.beginPath();
          ctx.arc(ecx, ecy, ringRad + 65, 0, Math.PI * 2);
          ctx.fill();

          // Black moon disc in front
          ctx.fillStyle = '#050508';
          ctx.beginPath();
          ctx.arc(ecx, ecy, ringRad, 0, Math.PI * 2);
          ctx.fill();

          // White ring rim
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 3.5;
          ctx.shadowBlur = 15;
          ctx.shadowColor = 'rgba(0, 255, 200, 0.8)';
          ctx.beginPath();
          ctx.arc(ecx, ecy, ringRad + 1, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }

        // 2. Draw Tritone digital glitch fissure split
        if (this.tritoneGlitch.active) {
          const fx = canvas.width / 2;
          ctx.save();
          ctx.strokeStyle = Math.random() < 0.5 ? '#00ffff' : '#ff00ff';
          ctx.lineWidth = 2 + Math.random() * 3;
          ctx.shadowBlur = 10;
          ctx.shadowColor = ctx.strokeStyle;
          ctx.beginPath();
          let currentY = 0;
          ctx.moveTo(fx, currentY);
          while (currentY < canvas.height) {
            const stepY = 15 + Math.random() * 20;
            const driftX = (Math.random() - 0.5) * 35 * this.tritoneGlitch.severity;
            currentY += stepY;
            ctx.lineTo(fx + driftX, currentY);
          }
          ctx.stroke();
          ctx.restore();

          // Draw binary bits & error hex strings floating outwards
          if (Math.random() < 0.25) {
            const code = Math.random() < 0.5 
              ? (Math.random() < 0.5 ? '0' : '1') 
              : (Math.random() < 0.5 ? '0x4F' : 'ERR_TRITONE');
            this.particles.push({
              x: fx + (Math.random() - 0.5) * 10,
              y: Math.random() * canvas.height,
              vx: (Math.random() - 0.5) * 6,
              vy: (Math.random() - 0.5) * 2 - 1,
              color: Math.random() < 0.5 ? '#00ffff' : '#ff00ff',
              size: 11,
              life: 800, maxLife: 800,
              friction: 0.01, gravity: -0.01, turbulence: 0.05,
              type: 'digit',
              extra: code
            });
          }
        }

        // 3. Draw concentric ripples (bioluminescent storm)
        ctx.save();
        this.ripples.forEach(r => {
          ctx.strokeStyle = r.color;
          ctx.globalAlpha = r.alpha;
          ctx.lineWidth = r.width;
          ctx.shadowBlur = 12;
          ctx.shadowColor = r.color;
          ctx.beginPath();
          ctx.ellipse(r.cx, r.cy, r.radius * 2.2, r.radius * 0.65, 0, 0, Math.PI * 2);
          ctx.stroke();
        });
        ctx.restore();

        // 4. Draw lightning bolts
        ctx.save();
        this.lightning.forEach(bolt => {
          ctx.strokeStyle = bolt.color;
          ctx.lineWidth = bolt.width;
          ctx.globalAlpha = bolt.alpha;
          ctx.shadowBlur = 15;
          ctx.shadowColor = bolt.color;
          ctx.beginPath();
          bolt.segments.forEach(seg => {
            ctx.moveTo(seg.x1, seg.y1);
            ctx.lineTo(seg.x2, seg.y2);
          });
          ctx.stroke();
        });
        ctx.restore();

        // 5. Draw particles (Lighter composite mode for beautiful glowing overlay)
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        this.particles.forEach(p => {
          ctx.globalAlpha = p.alpha;
          ctx.shadowBlur = p.size > 5 ? 12 : 0;
          ctx.shadowColor = p.color;

          if (p.type === 'digit') {
            ctx.fillStyle = p.color;
            ctx.font = `bold ${p.size}px 'Courier New', monospace`;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(p.extra, p.x, p.y);
          } else {
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
          }
        });
        ctx.restore();

        // 6. Draw geometric crystal shards (shatter Major Second)
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        this.shards.forEach(s => {
          ctx.globalAlpha = s.alpha;
          ctx.fillStyle = s.color;
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.2;
          ctx.shadowBlur = 10;
          ctx.shadowColor = s.color;

          ctx.save();
          ctx.translate(s.x, s.y);
          ctx.rotate(s.rotation);
          ctx.beginPath();
          ctx.moveTo(0, -s.size);
          ctx.lineTo(s.size * 0.6, s.size * 0.2);
          ctx.lineTo(0, s.size * 0.7);
          ctx.lineTo(-s.size * 0.6, s.size * 0.2);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        });
        ctx.restore();

        // 7. Swirling Yin-Yang vortex (Duo Same Root, contrasting qualities)
        if (this.yinyang.active) {
          const cyx = canvas.width / 2;
          const cyy = canvas.height * 0.52;
          const radius = 105;
          const speed = now * 0.0035;

          ctx.save();
          ctx.globalCompositeOperation = 'screen';

          // Vortex arm 1: Fiery Orange/Yellow
          const arm1X = cyx + Math.cos(speed) * radius;
          const arm1Y = cyy + Math.sin(speed) * radius;
          const grad1 = ctx.createRadialGradient(arm1X, arm1Y, 0, arm1X, arm1Y, 35);
          grad1.addColorStop(0, 'rgba(255, 120, 30, 0.9)');
          grad1.addColorStop(0.5, 'rgba(255, 70, 0, 0.45)');
          grad1.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = grad1;
          ctx.beginPath(); ctx.arc(arm1X, arm1Y, 35, 0, Math.PI * 2); ctx.fill();

          // Vortex arm 2: Icy Blue/Purple
          const arm2X = cyx + Math.cos(speed + Math.PI) * radius;
          const arm2Y = cyy + Math.sin(speed + Math.PI) * radius;
          const grad2 = ctx.createRadialGradient(arm2X, arm2Y, 0, arm2X, arm2Y, 35);
          grad2.addColorStop(0, 'rgba(0, 180, 255, 0.9)');
          grad2.addColorStop(0.5, 'rgba(100, 0, 255, 0.45)');
          grad2.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = grad2;
          ctx.beginPath(); ctx.arc(arm2X, arm2Y, 35, 0, Math.PI * 2); ctx.fill();

          // Spawn swirling particles trailing off arms
          if (Math.random() < 0.4) {
            this.particles.push({
              x: arm1X + (Math.random() - 0.5) * 8,
              y: arm1Y + (Math.random() - 0.5) * 8,
              vx: -Math.sin(speed) * 3 + (Math.random() - 0.5) * 1.5,
              vy: Math.cos(speed) * 3 + (Math.random() - 0.5) * 1.5,
              color: Math.random() < 0.5 ? '#ffaa00' : '#ff3300',
              size: 2 + Math.random() * 3,
              life: 550, maxLife: 550,
              friction: 0.01, gravity: 0, turbulence: 0.05
            });
            this.particles.push({
              x: arm2X + (Math.random() - 0.5) * 8,
              y: arm2Y + (Math.random() - 0.5) * 8,
              vx: Math.sin(speed) * 3 + (Math.random() - 0.5) * 1.5,
              vy: -Math.cos(speed) * 3 + (Math.random() - 0.5) * 1.5,
              color: Math.random() < 0.5 ? '#00c3ff' : '#8800ff',
              size: 2 + Math.random() * 3,
              life: 550, maxLife: 550,
              friction: 0.01, gravity: 0, turbulence: 0.05
      }
    };

    function drawHeartPath(ctx, x, y, width, height) {
      // Use parametric heart for accurate shape
      ctx.beginPath();
      const steps = 80;
      for (let i = 0; i <= steps; i++) {
        const t = (i / steps) * Math.PI * 2;
        const px = x + heartSplineX(t) * width * 6.5;
        const py = y - heartSplineY(t) * height * 6.5;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
    }

    function generateLightning(x1, y1, x2, y2, displace, minSegment = 10) {
      const segments = [];
      function subdivide(ax, ay, bx, by, d) {
        const dx = bx - ax;
        const dy = by - ay;
        const dist = Math.hypot(dx, dy);
        if (dist < minSegment) {
          segments.push({ x1: ax, y1: ay, x2: bx, y2: by });
        } else {
          let midX = (ax + bx) / 2;
          let midY = (ay + by) / 2;
          const nx = -dy / dist;
          const ny = dx / dist;
          const offset = (Math.random() - 0.5) * d;
          midX += nx * offset;
          midY += ny * offset;
          subdivide(ax, ay, midX, midY, d / 2);
          subdivide(midX, midY, bx, by, d / 2);
        }
      }
      subdivide(x1, y1, x2, y2, displace);
      return segments;
    }

    // ===================================================================
          alpha: 1.0
        });
      }
    }

    // ===================================================================
    // 8. MEDIAPIPE ONRESULTS MAIN LOOP
    // ===================================================================
    function onResults(results) {
      const now = performance.now();

      // FPS Calculation
      frameTick++;
      if (now - fpsLastSec >= 1000) {
        fps = frameTick;
        frameTick = 0;
        fpsLastSec = now;
      }

      // Draw mirrored video background
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.scale(-1, 1);
      ctx.drawImage(videoEl, -canvas.width, 0, canvas.width, canvas.height);
      ctx.restore();



      ctx.fillStyle = 'rgba(8,8,14,0.32)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Partition hands based on active mode
      let p1Hands = [];
      let p1Handedness = [];
      let p2Hands = [];
      let p2Handedness = [];

      if (playMode === 'duo') {
        const partitioned = partitionHands(results);
        p1Hands = partitioned.p1Hands;
        p1Handedness = partitioned.p1Handedness;
        p2Hands = partitioned.p2Hands;
        p2Handedness = partitioned.p2Handedness;
      } else {
        // Single player mode: all detected hands map to Player 1
        if (results.multiHandLandmarks) {
          for (let i = 0; i < results.multiHandLandmarks.length; i++) {
            p1Hands.push(results.multiHandLandmarks[i]);
            p1Handedness.push(results.multiHandedness[i]);
          }
        }
        // Force silence player 2
        if (p2ChordActive) p2ChordActive.releaseAll();
        if (p2ArpActive) p2ArpActive.releaseAll();
        p2StableRoot = null;
        p2StableQuality = 'Major';
        p2PrevChordKey = null;
      }

      // Subtle zone tints / overlays
      if (playMode === 'duo') {
        if (p1Hands.length > 0) {
          ctx.fillStyle = 'rgba(0, 255, 136, 0.04)';
          ctx.fillRect(0, 0, canvas.width / 2, canvas.height);
        }
        if (p2Hands.length > 0) {
          ctx.fillStyle = 'rgba(255, 110, 199, 0.04)';
          ctx.fillRect(canvas.width / 2, 0, canvas.width / 2, canvas.height);
        }
      } else {
        if (p1Hands.length > 0) {
          ctx.fillStyle = 'rgba(0, 255, 136, 0.03)';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
      }

      // ---- PROCESS PLAYER 1 ----
      let rawRootP1 = null;
      let rawQualityP1 = null;
      let p1RightHandLm = null;

      for (let i = 0; i < p1Hands.length; i++) {
        const lm = p1Hands[i];
        const info = p1Handedness[i];
        if (info.label === 'Right') {
          rawRootP1 = detectLeftGesture(lm, 'Left');
        } else if (info.label === 'Left') {
          rawQualityP1 = detectRightHandPointingForPlayer(lm, 1);
          p1RightHandLm = lm;
        }
      }

      // Debounce Player 1 Root
      if (rawRootP1 !== p1LastRawRoot) { p1LastRawRoot = rawRootP1; p1RootSince = now; }
      if (now - p1RootSince >= DEBOUNCE_ROOT_MS) {
        if (rawRootP1 !== p1StableRoot) p1StableRoot = rawRootP1;
      }

      // Debounce Player 1 Quality (sticky behavior)
      if (rawQualityP1 !== null) {
        if (rawQualityP1 !== p1LastRawQuality) { p1LastRawQuality = rawQualityP1; p1QualitySince = now; }
        if (now - p1QualitySince >= DEBOUNCE_QUALITY_MS) {
          if (rawQualityP1 !== p1StableQuality) p1StableQuality = rawQualityP1;
        }
      }

      // Draw Pointer dot on P1 pointing hand
      if (p1RightHandLm && rawQualityP1) {
        drawPointerDot(p1RightHandLm, '#00ff88');
      }

      // ---- PROCESS PLAYER 2 (Duo mode only) ----
      let rawRootP2 = null;
      let rawQualityP2 = null;
      let p2RightHandLm = null;

      if (playMode === 'duo') {
        for (let i = 0; i < p2Hands.length; i++) {
          const lm = p2Hands[i];
          const info = p2Handedness[i];
          if (info.label === 'Right') {
            rawRootP2 = detectLeftGesture(lm, 'Left');
          } else if (info.label === 'Left') {
            rawQualityP2 = detectRightHandPointingForPlayer(lm, 2);
            p2RightHandLm = lm;
          }
        }

        // Debounce Player 2 Root
        if (rawRootP2 !== p2LastRawRoot) { p2LastRawRoot = rawRootP2; p2RootSince = now; }
        if (now - p2RootSince >= DEBOUNCE_ROOT_MS) {
          if (rawRootP2 !== p2StableRoot) p2StableRoot = rawRootP2;
        }

        // Debounce Player 2 Quality (sticky behavior)
        if (rawQualityP2 !== null) {
          if (rawQualityP2 !== p2LastRawQuality) { p2LastRawQuality = rawQualityP2; p2QualitySince = now; }
          if (now - p2QualitySince >= DEBOUNCE_QUALITY_MS) {
            if (rawQualityP2 !== p2StableQuality) p2StableQuality = rawQualityP2;
          }
        }

        // Draw Pointer dot on P2 pointing hand
        if (p2RightHandLm && rawQualityP2) {
          drawPointerDot(p2RightHandLm, '#ff6ec7');
        }
      }

      // ---- AUDIO TRIGGER & SCOREBOARD CHECKS ----
      const p1ChordKey = p1StableRoot + '_' + p1StableQuality;
      if (p1ChordKey !== p1PrevChordKey) {
        p1PrevChordKey = p1ChordKey;
        const voicedNotes = voiceBlockChord(p1StableRoot, p1StableQuality);
        triggerChordP1(voicedNotes);
        if (p1StableRoot && p1StableRoot !== 'Stop') {
          p1ChordsCount++;
        }
      }

      if (playMode === 'duo') {
        const p2ChordKey = p2StableRoot + '_' + p2StableQuality;
        if (p2ChordKey !== p2PrevChordKey) {
          p2PrevChordKey = p2ChordKey;
          const voicedNotes = voiceBlockChord(p2StableRoot, p2StableQuality);
          triggerChordP2(voicedNotes);
          if (p2StableRoot && p2StableRoot !== 'Stop') {
            p2ChordsCount++;
          }
        }
      }

      // Collaborative Harmony check
      const p1ChordName = chordDisplayName(p1StableRoot, p1StableQuality);
      const p2ChordName = playMode === 'duo' ? chordDisplayName(p2StableRoot, p2StableQuality) : '—';
      const currentHarmony = playMode === 'duo' ? checkHarmony(p1ChordName, p2ChordName) : null;

      if (playMode === 'duo' && currentHarmony && currentHarmony !== lastTrackedHarmony) {
        togetherHarmoniesCount++;
        lastTrackedHarmony = currentHarmony;
      }

      // VFX Trigger Check
      const p1Root = p1StableRoot;
      const p1Qual = p1StableQuality;
      const p2Root = playMode === 'duo' ? p2StableRoot : null;
      const p2Qual = playMode === 'duo' ? p2StableQuality : null;

      if (playMode === 'duo' && p1Root && p1Root !== 'Stop' && p2Root && p2Root !== 'Stop') {
        const currentComboKey = `${p1Root}_${p1Qual}+${p2Root}_${p2Qual}`;
        if (currentComboKey !== lastVfxComboKey) {
          lastVfxComboKey = currentComboKey;
          VFXShaderSystem.kill(); // kill previous visual immediately

          const ri1 = p1Root === 'C5' ? 12 : NOTE_NAMES.indexOf(p1Root);
          const ri2 = p2Root === 'C5' ? 12 : NOTE_NAMES.indexOf(p2Root);
          const interval = Math.abs(ri1 - ri2) % 12;

          // --- VFX Dispatch: priority order, each fires independently ---

          // 1. EXACT SAME CHORD (root + quality) → Heart
          if (p1Root === p2Root && p1Qual === p2Qual) {
            trigger_SameChordHeart();
          }
          // 2. SAME ROOT, different quality → Yin-Yang vortex
          else if (p1Root === p2Root && p1Qual !== p2Qual) {
            trigger_YinYangRootUnity();
          }
          // 3. PERFECT FIFTH (interval 7 semitones) → Firework
          else if (interval === 7 || interval === 5) {
            trigger_PerfectFifthFirework();
          }
          // 4. TRITONE (interval 6 semitones) → Glitch fissure
          else if (interval === 6) {
            trigger_TritoneGlitchB_F();
          }
          // 5. MAJOR SECOND (interval 2) → Shatter
          else if (interval === 2 || interval === 10) {
            trigger_ShatterMajorSecond();
          }
          // 6. MAJOR + MINOR chord quality combo → Rainbow
          else if ((p1Qual === 'Major' && p2Qual === 'Minor') || (p1Qual === 'Minor' && p2Qual === 'Major')) {
            trigger_RainbowMajorMinor(p1Qual === 'Major' ? 1 : 2, p2Qual === 'Minor' ? 2 : 1);
          }
          // 7. MAJOR + MAJ7 → Eclipse
          else if ((p1Qual === 'Major' && p2Qual === 'Maj7') || (p1Qual === 'Maj7' && p2Qual === 'Major')) {
            trigger_EclipseMajorMaj7();
          }
          // 8. DOM7 + MIN7 → Bioluminescent Storm
          else if ((p1Qual === 'Dom7' && p2Qual === 'Min7') || (p1Qual === 'Min7' && p2Qual === 'Dom7')) {
            trigger_BioluminescentStormDom7Min7(p1Qual === 'Dom7' ? 1 : 2, p2Qual === 'Min7' ? 2 : 1);
          }
          // 9. SUS4 + SUS2 → Time Freeze
          else if ((p1Qual === 'Sus4' && p2Qual === 'Sus2') || (p1Qual === 'Sus2' && p2Qual === 'Sus4')) {
            trigger_TimeFreezeSus4Sus2();
          }
        }
      } else {
        if (lastVfxComboKey !== null) {
          lastVfxComboKey = null;
          VFXShaderSystem.kill(); // kill active shader instantly when combo ends
        }
      }

      // ---- UPDATE DOM HUD ELEMENTS ----
      const p1ChordLabelText = p1ChordName || '—';
      const p2ChordLabelText = p2ChordName || '—';
      
      document.getElementById('p1-hud-chord').textContent = p1ChordLabelText;
      document.getElementById('p1-chord-label').textContent = p1ChordLabelText;

      if (playMode === 'duo') {
        document.getElementById('p2-hud-chord').textContent = p2ChordLabelText;
        document.getElementById('p2-chord-label').textContent = p2ChordLabelText;
        document.getElementById('p2-hud-bar').style.width = p2Hands.length > 0 ? '100%' : '0%';
        document.getElementById('p2-hud-fingers').textContent = `Root: ${p2StableRoot || '—'} | Quality: ${p2StableQuality}`;
      }

      // Confidence bars (100% if hand exists, 0% otherwise)
      document.getElementById('p1-hud-bar').style.width = p1Hands.length > 0 ? '100%' : '0%';
      document.getElementById('p1-hud-fingers').textContent = `Root: ${p1StableRoot || '—'} | Quality: ${p1StableQuality}`;

      // Scoreboard text update
      if (playMode === 'duo') {
        document.getElementById('scoreboard').textContent = `🎵 Session  P1: ${p1ChordsCount} chords  P2: ${p2ChordsCount} chords  Together: ${togetherHarmoniesCount} harmonies`;
      } else {
        document.getElementById('scoreboard').textContent = `🎵 Session  Chords Triggered: ${p1ChordsCount}`;
      }

      // Harmony Label text update
      const harmEl = document.getElementById('harmony-label');
      if (playMode === 'duo' && currentHarmony) {
        harmEl.textContent = currentHarmony;
        harmEl.classList.add('active');
      } else {
        harmEl.classList.remove('active');
      }

      // Update Player 1 card highlights
      document.querySelectorAll('#p1-left-panel .gesture-card').forEach(card => {
        if (card.dataset.note === p1StableRoot) card.classList.add('active');
        else card.classList.remove('active');
      });
      document.querySelectorAll('#p1-right-panel .orbital-node').forEach(node => {
        if (node.dataset.quality === p1StableQuality) node.classList.add('active');
        else node.classList.remove('active');
      });

      // Update Player 2 card highlights (duo mode only)
      if (playMode === 'duo') {
        document.querySelectorAll('#p2-left-panel .gesture-card').forEach(card => {
          if (card.dataset.note === p2StableRoot) card.classList.add('active');
          else card.classList.remove('active');
        });
        document.querySelectorAll('#p2-right-panel .orbital-node').forEach(node => {
          if (node.dataset.quality === p2StableQuality) node.classList.add('active');
          else node.classList.remove('active');
        });
      }

      // ---- CANVAS RENDERINGS ----
      if (playMode === 'duo') {
        // 1. Divider Line
        ctx.save();
        ctx.setLineDash([10, 8]);
        ctx.lineWidth = 1.5;
        if (currentHarmony) {
          ctx.shadowBlur = 20;
          ctx.shadowColor = '#ffffff';
          ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        } else {
          ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        }
        ctx.beginPath();
        ctx.moveTo(canvas.width / 2, 0);
        ctx.lineTo(canvas.width / 2, canvas.height);
        ctx.stroke();
        ctx.restore();
      }

      // 2. skeletons (different colors)
      // Update ambient mist + render WebGL shader effect
      AmbientMist.update();
      AmbientMist.draw(ctx);
      VFXShaderSystem.render();

      for (let i = 0; i < p1Hands.length; i++) drawSkeleton(p1Hands[i], '#00ff88');
      if (playMode === 'duo') {
        for (let i = 0; i < p2Hands.length; i++) drawSkeleton(p2Hands[i], '#ff6ec7');
      }

      // 3. FPS
      drawFPS();
    }

    // ===================================================================
    // 9. EVENT BINDINGS
    // ===================================================================
    function bindSoundControls() {
      // Player Setting Tabs
      document.getElementById('sc-tab-p1')?.addEventListener('click', () => {
        currentTabPlayer = 1;
        updateSoundControlsUI();
      });
      document.getElementById('sc-tab-p2')?.addEventListener('click', () => {
        currentTabPlayer = 2;
        updateSoundControlsUI();
      });

      // Timbre
      document.querySelectorAll('.sc-timbre-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          setTimbre(currentTabPlayer, btn.dataset.timbre);
          updateSoundControlsUI();
        });
      });

      // Autoplay selector
      document.querySelectorAll('.sc-autoplay-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const dsp = currentTabPlayer === 1 ? p1Dsp : p2Dsp;
          dsp.autoplayLevel = +btn.dataset.level;
          silenceAll();
          if (dsp.autoplayLevel > 0 && Tone.Transport.state !== 'started') {
            Tone.Transport.start();
          }
          updateSoundControlsUI();
        });
      });

      // Filters
      const hp = document.getElementById('hp-filter');
      hp?.addEventListener('input', () => {
        const dsp = currentTabPlayer === 1 ? p1Dsp : p2Dsp;
        dsp.hpFreq = +hp.value;
        const targetFilter = currentTabPlayer === 1 ? p1HpFilter : p2HpFilter;
        if (targetFilter) targetFilter.frequency.rampTo(dsp.hpFreq, 0.1);
        document.getElementById('hp-val').textContent = dsp.hpFreq < 1000 ? dsp.hpFreq + 'Hz' : (dsp.hpFreq/1000).toFixed(1) + 'k';
      });

      const lp = document.getElementById('lp-filter');
      lp?.addEventListener('input', () => {
        const dsp = currentTabPlayer === 1 ? p1Dsp : p2Dsp;
        dsp.lpFreq = +lp.value;
        const targetFilter = currentTabPlayer === 1 ? p1LpFilter : p2LpFilter;
        if (targetFilter) targetFilter.frequency.rampTo(dsp.lpFreq, 0.1);
        document.getElementById('lp-val').textContent = dsp.lpFreq >= 10000 ? (dsp.lpFreq/1000).toFixed(1)+'k' : (dsp.lpFreq/1000).toFixed(2)+'k';
      });

      // Sliders
      const volSlider = document.getElementById('volume-slider');
      volSlider?.addEventListener('input', () => {
        const dsp = currentTabPlayer === 1 ? p1Dsp : p2Dsp;
        const v = +volSlider.value;
        dsp.volume = v === 0 ? -Infinity : -60 + v * 0.6;
        const targetVol = currentTabPlayer === 1 ? p1VolumeNode : p2VolumeNode;
        if (targetVol) targetVol.volume.rampTo(dsp.volume, 0.1);
      });

      const dyn = document.getElementById('dynamics-slider');
      dyn?.addEventListener('input', () => {
        const dsp = currentTabPlayer === 1 ? p1Dsp : p2Dsp;
        dsp.velocity = +dyn.value / 100;
      });

      const rev = document.getElementById('reverb-slider');
      rev?.addEventListener('input', () => {
        reverbWet = +rev.value / 100;
        if (reverb) reverb.wet.rampTo(reverbWet, 0.1);
      });

      // ADSR
      const adsrInputs = { a: 'adsr-a', d: 'adsr-d', s: 'adsr-s', r: 'adsr-r' };
      Object.entries(adsrInputs).forEach(([key, id]) => {
        const el = document.getElementById(id);
        el?.addEventListener('input', () => {
          const dsp = currentTabPlayer === 1 ? p1Dsp : p2Dsp;
          const v = +el.value;
          if (key === 'a') { dsp.attack = v / 1000; document.getElementById('a-val').textContent = dsp.attack.toFixed(2) + 's'; }
          if (key === 'd') { dsp.decay  = v / 1000; document.getElementById('d-val').textContent = dsp.decay.toFixed(2) + 's'; }
          if (key === 's') { dsp.sustain = v / 100;  document.getElementById('s-val').textContent = v + '%'; }
          if (key === 'r') { dsp.release = v / 1000; document.getElementById('r-val').textContent = dsp.release.toFixed(2) + 's'; }
          
          updatePlayerEnvelope(currentTabPlayer);
          drawADSR();
        });
      });

      // Collapse Sound Controls
      document.getElementById('sc-toggle-btn')?.addEventListener('click', () => {
        document.getElementById('sc-body')?.classList.toggle('collapsed');
      });

      adsrCanvas = document.getElementById('adsr-canvas');
      if (adsrCanvas) adsrCtx = adsrCanvas.getContext('2d');
      updateSoundControlsUI();
    }

    function drawADSR() {
      if (!adsrCtx) return;
      const dsp = currentTabPlayer === 1 ? p1Dsp : p2Dsp;
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
    // 10. SETUP & INITIALIZATION
    // ===================================================================
    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }

    let mpHandsInstance = null;

    function startCamera() {
      mpHandsInstance = new Hands({
        locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`
      });
      mpHandsInstance.setOptions({
        maxNumHands: 4,
        modelComplexity: 1,
        minDetectionConfidence: 0.7,
        minTrackingConfidence: 0.6
      });
      mpHandsInstance.onResults(onResults);

      const cam = new Camera(videoEl, {
        onFrame: async () => { await mpHandsInstance.send({ image: videoEl }); },
        width: 1280, height: 720
      });
      cam.start();
    }

    (function init() {
      resize();
      window.addEventListener('resize', resize);
      initAudio();
      bindSoundControls();
      AmbientMist.init();
      VFXShaderSystem.init();  // async — shaders load in background

      // Mode Selector Button Handlers
      const btnSingle = document.getElementById('btn-mode-single');
      const btnDuo = document.getElementById('btn-mode-duo');
      const tabP2 = document.getElementById('sc-tab-p2');

      // Initialize body state as single player
      document.body.classList.add('mode-single');

      const switchMode = (mode) => {
        playMode = mode;
        silenceAll();

        if (mode === 'single') {
          btnSingle.classList.add('active');
          btnDuo.classList.remove('active');
          document.body.classList.remove('mode-duo');
          document.body.classList.add('mode-single');
          if (tabP2) tabP2.style.display = 'none';
          currentTabPlayer = 1;
          updateSoundControlsUI();
        } else {
          btnSingle.classList.remove('active');
          btnDuo.classList.add('active');
          document.body.classList.remove('mode-single');
          document.body.classList.add('mode-duo');
          if (tabP2) tabP2.style.display = 'block';
          updateSoundControlsUI();
        }
      };

      btnSingle?.addEventListener('click', () => switchMode('single'));
      btnDuo?.addEventListener('click', () => switchMode('duo'));

      // Show Tap to Begin immediately to prevent Web Audio / decoding deadlocks
      const sub = document.querySelector('.overlay-subtitle');
      if (sub) sub.textContent = 'Tap anywhere to begin';

      // Load samples in the background
      Tone.loaded().then(() => {
        samplersLoaded = true;
        console.log('[samples] All strings samplers fully loaded and ready');
      }).catch(err => {
        console.error('[samples] Failed to load samples:', err);
        samplersLoaded = true; // Fallback
      });

      const overlay = document.getElementById('start-overlay');
      const begin = async () => {
        if (audioStarted) return;
        audioStarted = true;
        overlay.classList.add('hidden');

        try {
          await Tone.start();
          Tone.Transport.start();
        } catch (e) {
          console.error('Tone start failed:', e);
        }

        try {
          startCamera();
        } catch (e) {
          console.error('Camera launch failed:', e);
        }
      };

      overlay.addEventListener('click', begin);
      overlay.addEventListener('touchstart', begin, { passive: true });
    })();
  