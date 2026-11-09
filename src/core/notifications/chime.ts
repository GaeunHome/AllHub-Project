/** C6 再 G6 兩個短音 疊一點八度泛音像小鈴鐺 全部不到 1 秒 */
const NOTES = [
  { frequency: 1046.5, start: 0, duration: 0.42, gain: 0.16 },
  { frequency: 1568, start: 0.12, duration: 0.6, gain: 0.13 },
] as const;
const OVERTONE_RATIO = 2;
const OVERTONE_GAIN = 0.22;
const ATTACK_S = 0.012;
const SILENT = 0.0001;

type AudioContextFactory = () => AudioContext | null;

/** unlock 回傳聲音準備好了沒 好了就不用再聽點擊與按鍵 */
export type ChimePlayer = { unlock(): boolean; play(): boolean; preview(): Promise<boolean> };

// Chrome 只把部分點擊與按鍵算成使用者操作 只按快捷鍵或手指剛碰到螢幕不算
const UNLOCK_EVENTS = ["pointerdown", "pointerup", "touchend", "keydown"] as const;

function browserAudioContext(): AudioContext | null {
  const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return Context ? new Context() : null;
}

/** 舊瀏覽器沒有這個 API 照舊當成操作過 */
const browserUserActive = () => navigator.userActivation?.isActive ?? true;

/**
 * 瀏覽器規定互動過才能出聲 不算數的時候建立或 resume 會在主控台警告
 * 所以只在使用者操作的當下 unlock 還沒解鎖時 play 回 false
 */
export function createChimePlayer(createContext: AudioContextFactory = browserAudioContext, userActive: () => boolean = browserUserActive): ChimePlayer {
  let context: AudioContext | null = null;
  let created = false;

  function unlock() {
    if (!userActive()) return false;
    if (!created) {
      created = true;
      try {
        context = createContext();
      } catch {
        context = null;
      }
    }
    if (context?.state === "suspended") void context.resume().catch(() => {});
    return true;
  }

  // 通知是背景輪詢來的 不是使用者操作 被暫停時等下一次點擊再 resume
  function play() {
    if (!context || context.state !== "running") return false;
    const now = context.currentTime;
    for (const note of NOTES) {
      tone(context, note.frequency, now + note.start, note.duration, note.gain);
      tone(context, note.frequency * OVERTONE_RATIO, now + note.start, note.duration * 0.6, note.gain * OVERTONE_GAIN);
    }
    return true;
  }

  // 試聽按鈕本身就是互動 可以等 resume 完成再播 不必等下一則通知
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
  // 從幾乎無聲快速升起再指數衰減 才不會有爆音
  gain.gain.setValueAtTime(SILENT, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + ATTACK_S);
  gain.gain.exponentialRampToValueAtTime(SILENT, start + duration);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

/** 聽點擊與按鍵直到聲音解鎖 回傳拿掉監聽的函式 */
export function unlockOnGesture(player: Pick<ChimePlayer, "unlock">, target: EventTarget = window): () => void {
  const stop = () => {
    for (const type of UNLOCK_EVENTS) target.removeEventListener(type, onGesture, { capture: true });
  };
  function onGesture() {
    if (player.unlock()) stop();
  }
  for (const type of UNLOCK_EVENTS) target.addEventListener(type, onGesture, { capture: true, passive: true });
  return stop;
}

/** 整個網站共用一個 AudioContext 只建一次 */
export const chime = createChimePlayer();
