import { describe, expect, it, vi } from "vitest";
import type { Progress } from "../service/translation";
import { runTranslationLoop, type LoopResult } from "./translation-loop";

const progress = (status: Progress["status"], extra: Partial<Progress> = {}): Progress => ({
  status,
  done: 0,
  total: 10,
  error: null,
  translated: [],
  ...extra,
});

/** 依序回應的假 Server Action；陣列裡的 Error 代表那一次呼叫丟例外 */
function fakeCall(results: Array<LoopResult | Error>) {
  let i = 0;
  return vi.fn(async () => {
    const next = results[Math.min(i++, results.length - 1)];
    if (next instanceof Error) throw next;
    return next;
  });
}

function run(call: ReturnType<typeof fakeCall>, isCancelled = () => false, position?: () => number | undefined) {
  const sleeps: number[] = [];
  const onProgress = vi.fn();
  const done = runTranslationLoop({
    call,
    position,
    onProgress,
    isCancelled,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  });
  return { done, sleeps, onProgress };
}

describe("runTranslationLoop", () => {
  it("一直呼叫到完成，每次都回報進度", async () => {
    const call = fakeCall([progress("queued", { done: 5 }), progress("done", { done: 10 })]);
    const { done, onProgress } = run(call);

    expect(await done).toBeNull();
    expect(onProgress.mock.calls.map(([p]) => p.done)).toEqual([5, 10]);
  });

  it("翻譯失敗（failed）是正常結束，交給畫面顯示錯誤與重試按鈕", async () => {
    const { done } = run(fakeCall([progress("failed", { error: "金鑰錯" })]));
    expect(await done).toBeNull();
  });

  it("別人正在翻（busy）→ 等一下再問", async () => {
    const call = fakeCall([progress("running", { busy: true }), progress("done")]);
    const { done, sleeps } = run(call);

    expect(await done).toBeNull();
    expect(call).toHaveBeenCalledTimes(2);
    expect(sleeps).toHaveLength(1);
  });

  it("呼叫丟例外（斷網、504、部署後找不到 Server Action）→ 退避重試，恢復後繼續", async () => {
    const call = fakeCall([new TypeError("Failed to fetch"), new Error("504"), progress("done")]);
    const { done, sleeps, onProgress } = run(call);

    expect(await done).toBeNull();
    expect(call).toHaveBeenCalledTimes(3);
    expect(sleeps).toHaveLength(2);
    expect(sleeps[1]).toBeGreaterThan(sleeps[0]);
    expect(onProgress).toHaveBeenCalledOnce();
  });

  it("一直丟例外 → 重試幾次後停下，回傳錯誤訊息讓畫面顯示「繼續翻譯」", async () => {
    const call = fakeCall([new TypeError("Failed to fetch")]);
    const { done } = run(call);

    const stop = await done;
    expect(stop?.message).toEqual(expect.stringContaining("繼續翻譯"));
    expect(stop?.needsSettings).toBeFalsy();
    expect(call.mock.calls.length).toBeGreaterThan(1);
    expect(call.mock.calls.length).toBeLessThanOrEqual(5);
  });

  it("成功一次後重新計算重試次數", async () => {
    const failing = new TypeError("Failed to fetch");
    const call = fakeCall([failing, failing, failing, progress("queued"), failing, failing, failing, progress("done")]);
    const { done } = run(call);

    expect(await done).toBeNull();
    expect(call).toHaveBeenCalledTimes(8);
  });

  it("Server Action 回傳 actionError → 停下並回傳訊息", async () => {
    const call = fakeCall([{ actionError: "翻譯失敗（詳見伺服器 log）" }]);
    const { done, onProgress } = run(call);

    expect(await done).toEqual({ message: "翻譯失敗（詳見伺服器 log）", needsSettings: false });
    expect(call).toHaveBeenCalledOnce();
    expect(onProgress).not.toHaveBeenCalled();
  });

  it("要到設定頁處理的錯誤（沒有 API Key）→ 停下並標示，畫面才能附上設定頁連結", async () => {
    const { done } = run(fakeCall([{ actionError: "還沒設定 Claude 的 API Key", needsSettings: true }]));
    expect(await done).toEqual({ message: "還沒設定 Claude 的 API Key", needsSettings: true });
  });

  it("每次呼叫都帶上當下的播放位置（毫秒），拖曳後下一次就用新位置", async () => {
    const positions = [1500, 2700, 300_000];
    const call = fakeCall([progress("queued"), progress("queued"), progress("done")]);
    const { done } = run(call, () => false, () => positions.shift());

    expect(await done).toBeNull();
    expect(call.mock.calls.map((args: unknown[]) => args[0])).toEqual([1500, 2700, 300_000]);
  });

  it("離開頁面（取消）後不再呼叫、不回報", async () => {
    let cancelled = false;
    const call = vi.fn(async () => {
      cancelled = true;
      return progress("queued");
    });
    const { done, onProgress } = run(call, () => cancelled);

    expect(await done).toBeNull();
    expect(call).toHaveBeenCalledOnce();
    expect(onProgress).not.toHaveBeenCalled();
  });
});
