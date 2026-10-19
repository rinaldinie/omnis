/**
 * Omnis Big Picture Web Audio Synthesizer (Zero-Latency, Zero External Dependencies)
 */

export class SoundSystem {
  private ctx: AudioContext | null = null;
  public enabled: boolean = true;
  private isMuted: boolean = false;

  constructor() {
    try {
      const saved = localStorage.getItem("omnis_sound_enabled");
      if (saved !== null) {
        this.enabled = saved === "true";
      }
    } catch {
      // Fallback if localStorage is unavailable
    }
  }

  /**
   * Toggles sound effects on/off and persists preference
   */
  public toggle(): boolean {
    this.enabled = !this.enabled;
    try {
      localStorage.setItem("omnis_sound_enabled", String(this.enabled));
    } catch {
      // Fallback
    }
    return this.enabled;
  }

  /**
   * Explicitly sets sound effects enabled state
   */
  public setEnabled(val: boolean) {
    this.enabled = val;
    try {
      localStorage.setItem("omnis_sound_enabled", String(this.enabled));
    } catch {
      // Fallback
    }
  }

  /**
   * Temporarily mutes or unmutes sound effects without altering persisted user preferences
   * (e.g. during active game execution)
   */
  public setMuted(val: boolean) {
    this.isMuted = val;
  }

  /**
   * Ensures AudioContext exists and resumes it if suspended by browser autoplay policy
   */
  private ensureContext() {
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
  }

  /**
   * Nav sound: Sine wave (320Hz -> 540Hz over 0.035s), gain 0.06 -> 0.001.
   * Used for D-pad / carousel movement and focus change.
   */
  public playNav() {
    if (!this.enabled || this.isMuted) return;
    try {
      this.ensureContext();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(320, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(540, this.ctx.currentTime + 0.035);
      gain.gain.setValueAtTime(0.06, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.035);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.onended = () => {
        try {
          osc.disconnect();
          gain.disconnect();
        } catch {}
      };
      osc.start();
      osc.stop(this.ctx.currentTime + 0.035);
    } catch {
      // Ignore web audio errors
    }
  }

  /**
   * Select sound: Triangle wave (580Hz -> 880Hz over 0.08s), gain 0.1 -> 0.001.
   * Used for item selection, card opening, keyboard keypress.
   */
  public playSelect() {
    if (!this.enabled || this.isMuted) return;
    try {
      this.ensureContext();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(580, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, this.ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.08);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.onended = () => {
        try {
          osc.disconnect();
          gain.disconnect();
        } catch {}
      };
      osc.start();
      osc.stop(this.ctx.currentTime + 0.08);
    } catch {
      // Ignore web audio errors
    }
  }

  /**
   * Launch sound: Sawtooth wave (440Hz -> 1100Hz over 0.25s), gain 0.12 -> 0.001.
   * Used for game launch.
   */
  public playLaunch() {
    if (!this.enabled || this.isMuted) return;
    try {
      this.ensureContext();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(440, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1100, this.ctx.currentTime + 0.25);
      gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.onended = () => {
        try {
          osc.disconnect();
          gain.disconnect();
        } catch {}
      };
      osc.start();
      osc.stop(this.ctx.currentTime + 0.25);
    } catch {
      // Ignore web audio errors
    }
  }
}

export const soundEffects = new SoundSystem();
export default soundEffects;
