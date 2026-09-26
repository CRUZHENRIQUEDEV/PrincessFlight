// Versão: 1.0

export interface AlertSound {
  play(): Promise<boolean>;
}

interface ToneContext {
  state: AudioContextState;
  currentTime: number;
  destination: AudioNode;
  resume(): Promise<void>;
  createOscillator(): OscillatorNode;
  createGain(): GainNode;
}

const NOTES = [880, 1174.66];

export function createAlertSound(createContext: () => ToneContext = defaultContext): AlertSound {
  let context: ToneContext | null = null;
  return {
    async play(): Promise<boolean> {
      try {
        context ??= createContext();
        if (context.state === 'suspended') await context.resume();
        playChime(context);
        return true;
      } catch {
        return false;
      }
    },
  };
}

function defaultContext(): ToneContext {
  return new AudioContext();
}

function playChime(context: ToneContext): void {
  const startAt = context.currentTime;
  NOTES.forEach((frequency, index) => scheduleNote(context, frequency, startAt + index * 0.14));
}

function scheduleNote(context: ToneContext, frequency: number, start: number): void {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.07, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.32);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + 0.36);
}
