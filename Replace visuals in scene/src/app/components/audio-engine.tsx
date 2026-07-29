// ============================================================
// Tone.js audio engine — two independent player voices.
// Uses synthesized timbres (no external samples required).
// Tone is loaded from CDN and read off window.Tone.
// ============================================================

declare global {
  interface Window {
    Tone: any;
    Hands: any;
    Camera: any;
  }
}

export type Timbre = "synth" | "strings" | "woodwind";

export interface PlayerSettings {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  hpFreq: number;
  lpFreq: number;
  volume: number; // dB
  timbre: Timbre;
  autoplayLevel: number; // 0..3
}

export const defaultSettings = (): PlayerSettings => ({
  attack: 0.08,
  decay: 0.3,
  sustain: 0.5,
  release: 1.0,
  hpFreq: 20,
  lpFreq: 20000,
  volume: -6,
  timbre: "strings",
  autoplayLevel: 0,
});

const TIMBRE_OSC: Record<Timbre, any> = {
  synth: { type: "fmsine", harmonicity: 1.5, modulationIndex: 2 },
  strings: { type: "sawtooth" },
  woodwind: { type: "triangle" },
};

class PlayerVoice {
  Tone: any;
  synth: any;
  hp: any;
  lp: any;
  vol: any;
  panner: any;
  settings: PlayerSettings;
  currentNotes: string[] = [];
  arpLoop: any = null;
  arpPool: string[] = [];
  arpStep = 0;

  constructor(Tone: any, pan: number, dest: any, settings: PlayerSettings) {
    this.Tone = Tone;
    this.settings = settings;
    this.synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: TIMBRE_OSC[settings.timbre],
      envelope: {
        attack: settings.attack,
        decay: settings.decay,
        sustain: settings.sustain,
        release: settings.release,
      },
    });
    this.synth.maxPolyphony = 16;
    this.hp = new Tone.Filter({ frequency: settings.hpFreq, type: "highpass", rolloff: -12 });
    this.lp = new Tone.Filter({ frequency: settings.lpFreq, type: "lowpass", rolloff: -12 });
    this.vol = new Tone.Volume(settings.volume);
    this.panner = new Tone.Panner(pan);
    this.synth.chain(this.hp, this.lp, this.vol, this.panner, dest);
  }

  applySettings(s: PlayerSettings) {
    const prevTimbre = this.settings.timbre;
    this.settings = s;
    this.hp.frequency.rampTo(s.hpFreq, 0.05);
    this.lp.frequency.rampTo(s.lpFreq, 0.05);
    this.vol.volume.rampTo(s.volume, 0.05);
    this.synth.set({
      envelope: { attack: s.attack, decay: s.decay, sustain: s.sustain, release: s.release },
    });
    if (prevTimbre !== s.timbre) {
      this.synth.set({ oscillator: TIMBRE_OSC[s.timbre] });
    }
  }

  private stopArp() {
    if (this.arpLoop) {
      this.arpLoop.stop();
      this.arpLoop.dispose();
      this.arpLoop = null;
    }
  }

  releaseAll() {
    this.stopArp();
    try { this.synth.releaseAll(); } catch { /* ignore */ }
    this.currentNotes = [];
  }

  play(notes: string[] | null, arpPool: string[] | null) {
    this.releaseAll();
    if (!notes || notes.length === 0) return;
    this.currentNotes = notes;
    const level = this.settings.autoplayLevel;

    if (level === 0 || !arpPool || arpPool.length === 0) {
      this.synth.triggerAttack(notes, this.Tone.now(), 0.6);
      return;
    }

    // Autoplay: sustain a soft pad + arpeggiate on a loop
    this.synth.triggerAttack(notes.slice(0, 2), this.Tone.now(), 0.35);
    this.arpPool = arpPool;
    this.arpStep = 0;
    const speeds = ["4n", "4n", "8n", "16n"];
    const density = [1, 2, 3, 4][level];
    const subdiv = speeds[level];
    this.arpLoop = new this.Tone.Loop((time: number) => {
      for (let k = 0; k < density; k++) {
        const n = this.arpPool[(this.arpStep + k) % this.arpPool.length];
        this.synth.triggerAttackRelease(n, "16n", time + k * 0.001, 0.4);
      }
      this.arpStep = (this.arpStep + 1) % this.arpPool.length;
    }, subdiv).start(0);
  }

  dispose() {
    this.stopArp();
    [this.synth, this.hp, this.lp, this.vol, this.panner].forEach((n) => {
      try { n.dispose(); } catch { /* ignore */ }
    });
  }
}

export class AudioEngine {
  Tone: any;
  reverb: any;
  master: any;
  p1!: PlayerVoice;
  p2!: PlayerVoice;
  started = false;

  async start(p1s: PlayerSettings, p2s: PlayerSettings, reverbWet: number, masterVol: number) {
    if (this.started) return;
    const Tone = window.Tone;
    if (!Tone) throw new Error("Tone.js not loaded");
    this.Tone = Tone;
    await Tone.start();

    this.master = new Tone.Volume(masterVol);
    this.reverb = new Tone.Reverb({ decay: 2.2, wet: reverbWet, preDelay: 0.01 });
    this.reverb.chain(this.master, Tone.Destination);

    this.p1 = new PlayerVoice(Tone, -0.4, this.reverb, p1s);
    this.p2 = new PlayerVoice(Tone, 0.4, this.reverb, p2s);

    Tone.Transport.bpm.value = 96;
    Tone.Transport.start();
    this.started = true;
  }

  setReverb(wet: number) {
    if (this.reverb) this.reverb.wet.rampTo(wet, 0.1);
  }
  setMaster(db: number) {
    if (this.master) this.master.volume.rampTo(db, 0.1);
  }
}
