import { describe, expect, it, vi } from "vitest";
import { createChimePlayer, unlockOnGesture } from "../chime";

class FakeParam {
  value = 0;
  points: Array<{ value: number; time: number }> = [];
  setValueAtTime(value: number, time: number) {
    this.points.push({ value, time });
    return this;
  }
  exponentialRampToValueAtTime(value: number, time: number) {
    this.points.push({ value, time });
    return this;
  }
  linearRampToValueAtTime(value: number, time: number) {
    this.points.push({ value, time });
    return this;
  }
}

class FakeNode {
  outputs: unknown[] = [];
  connect<T>(node: T): T {
    this.outputs.push(node);
    return node;
  }
}

class FakeOscillator extends FakeNode {
  type = "sine";
  frequency = new FakeParam();
  started?: number;
  stopped?: number;
  start(time: number) {
    this.started = time;
  }
  stop(time: number) {
    this.stopped = time;
  }
}

class FakeGain extends FakeNode {
  gain = new FakeParam();
}

class FakeContext {
  state: "running" | "suspended" = "running";
  currentTime = 12.5;
  destination = { name: "speakers" };
  oscillators: FakeOscillator[] = [];
  gains: FakeGain[] = [];
  resume = vi.fn(async () => {
    this.state = "running";
  });
  createOscillator() {
    const oscillator = new FakeOscillator();
    this.oscillators.push(oscillator);
    return oscillator;
  }
  createGain() {
    const gain = new FakeGain();
    this.gains.push(gain);
    return gain;
  }
}

const playerWith = (context: FakeContext | null) => createChimePlayer(() => context as unknown as AudioContext | null);

describe("createChimePlayer（Web Audio 合成提示音，不用音檔）", () => {
  it("使用者還沒在頁面上互動過（還沒有 AudioContext）_不播放", () => {
    const context = new FakeContext();

    expect(playerWith(context).play()).toBe(false);
    expect(context.oscillators).toHaveLength(0);
  });

  it("第一次互動時建立 AudioContext 並 resume_之後都用同一個", () => {
    const factory = vi.fn(() => new FakeContext() as unknown as AudioContext);
    const player = createChimePlayer(factory);

    player.unlock();
    player.unlock();

    expect(factory).toHaveBeenCalledOnce();
  });

  it("使用者回報過主控台的 AudioContext 警告：瀏覽器還不算使用者操作時（只按了打開開發者工具的快捷鍵、手指剛碰到螢幕）不建立，等算數的操作才建立", () => {
    const factory = vi.fn(() => new FakeContext() as unknown as AudioContext);
    let active = false;
    const player = createChimePlayer(factory, () => active);

    expect(player.unlock()).toBe(false);
    expect(factory).not.toHaveBeenCalled();

    active = true;
    expect(player.unlock()).toBe(true);
    expect(factory).toHaveBeenCalledOnce();
  });

  it("聲音被瀏覽器暫停（suspended）時通知進來_不在背景 resume（瀏覽器會警告），這次先不播，下一次操作時才 resume", () => {
    const context = new FakeContext();
    const player = playerWith(context);
    player.unlock();
    context.state = "suspended";

    expect(player.play()).toBe(false);
    expect(context.resume).not.toHaveBeenCalled();

    player.unlock();
    expect(context.resume).toHaveBeenCalled();
  });

  it("播放：兩個以上不同音高的短音、音量柔和、不到 1 秒就結束、接到喇叭", () => {
    const context = new FakeContext();
    const player = playerWith(context);
    player.unlock();

    expect(player.play()).toBe(true);

    const oscillators = context.oscillators;
    expect(new Set(oscillators.map((o) => o.frequency.value)).size).toBeGreaterThanOrEqual(2);
    expect(Math.min(...oscillators.map((o) => o.started!))).toBeCloseTo(context.currentTime, 3);
    expect(Math.max(...oscillators.map((o) => o.stopped!)) - context.currentTime).toBeLessThan(1);
    const peaks = context.gains.flatMap((g) => g.gain.points.map((p) => p.value));
    expect(Math.max(...peaks)).toBeLessThanOrEqual(0.25);
    expect(context.gains.every((g) => g.outputs.length > 0)).toBe(true);
    expect(context.gains.some((g) => g.outputs.includes(context.destination))).toBe(true);
  });

  it("preview()（設定頁的試聽按鈕，本身就是一次互動）_解鎖後等 resume 完成再播", async () => {
    const context = new FakeContext();
    context.state = "suspended";
    const player = playerWith(context);

    expect(await player.preview()).toBe(true);

    expect(context.resume).toHaveBeenCalled();
    expect(context.oscillators.length).toBeGreaterThan(0);
  });

  it("監聽點擊與按鍵直到聲音真的解鎖：不算數的操作之後照樣聽，解鎖後就不再聽", () => {
    const target = new EventTarget();
    const unlock = vi.fn().mockReturnValueOnce(false).mockReturnValue(true);
    unlockOnGesture({ unlock }, target);

    target.dispatchEvent(new Event("keydown"));
    target.dispatchEvent(new Event("pointerup"));
    target.dispatchEvent(new Event("pointerdown"));

    expect(unlock).toHaveBeenCalledTimes(2);
  });

  it("離開時拿掉監聽", () => {
    const target = new EventTarget();
    const unlock = vi.fn(() => false);
    const stop = unlockOnGesture({ unlock }, target);

    stop();
    target.dispatchEvent(new Event("keydown"));

    expect(unlock).not.toHaveBeenCalled();
  });

  it("瀏覽器不支援 Web Audio_不丟錯、play 回 false", () => {
    const player = playerWith(null);

    expect(() => player.unlock()).not.toThrow();
    expect(player.play()).toBe(false);
  });
});
