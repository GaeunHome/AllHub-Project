/** 一高一低的兩個短音（C6 → G6），疊一點八度泛音聽起來像小鈴鐺；全部加起來不到 1 秒 */
const NOTES = [
  { frequency: 1046.5, start: 0, duration: 0.42, gain: 0.16 },
  { frequency: 1568, start: 0.12, duration: 0.6, gain: 0.13 },
] as const;
const OVERTONE_RATIO = 2;
const OVERTONE_GAIN = 0.22;
const ATTACK_S = 0.012;
const SILENT = 0.0001;

type AudioContextFactory = () => AudioContext | null;

export type ChimePlayer = { unlock(): void; play(): boolean; preview(): Promise<boolean> };

function browserAudioContext(): AudioContext | null {
  const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return Context ? new Context() : null;
}

/** 瀏覽器規定使用者互動過才能出聲：第一次點擊或按鍵時 unlock() 建立 AudioContext，之後 play() 才響得出來，還沒解鎖就回 false */
export function createChimePlayer(createContext: AudioContextFactory = browserAudioContext): ChimePlayer {
  let context: AudioContext | null = null;
  let created = false;

  function unlock() {
    if (!created) {
      created = true;
      try {
        context = createContext();
      } catch {
        context = null;
      }
    }
    if (context?.state === "suspended") void context.resume().catch(() => {});
  }

  function play() {
    if (!context) return false;
    if (context.state !== "running") {
      void context.resume().catch(() => {});
      return false;
    }
    const now = context.currentTime;
    for (const note of NOTES) {
      tone(context, note.frequency, now + note.start, note.duration, note.gain);
      tone(context, note.frequency * OVERTONE_RATIO, now + note.start, note.duration * 0.6, note.gain * OVERTONE_GAIN);
    }
    return true;
  }

  // 試聽按鈕本身就是一次互動，可以等 resume 完成再播，不必等到下一則通知
  async function preview() {
    unlock();
    await context?.resume().catch(() => {});
    return play();
  }

  return { unlock, play, preview };
}

function tone(context: AudioContext, frequency: number, start: number, duration: number, peak: number) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = frequency;
  // 從幾乎無聲快速升起再指數衰減，不會有爆音
  gain.gain.setValueAtTime(SILENT, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + ATTACK_S);
  gain.gain.exponentialRampToValueAtTime(SILENT, start + duration);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

/** 整個網站共用一個，AudioContext 只建一次 */
export const chime = createChimePlayer();
