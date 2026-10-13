import { describe, expect, it, vi } from "vitest";
import type { Progress } from "../service/translation";
import { createJoinFlag, type JoinResult } from "./join-translation";

const PROGRESS: Progress = { status: "queued", done: 1, total: 8, error: null, translated: [] };
/** 假的續翻 Server Action：記下每次帶的 join */
const fakeCall = (result: JoinResult = PROGRESS) => vi.fn<(join: boolean) => Promise<JoinResult>>(async () => result);

describe("「用我的 API Key 繼續翻譯」：續翻成功之前每次呼叫都帶 join，伺服器才知道要把影片加進他保留的影片", () => {
  it("還沒按（自己發起的翻譯自動接著翻）_不帶 join", async () => {
    const join = createJoinFlag();
    const call = fakeCall();

    await join.send(call);

    expect(call).toHaveBeenCalledWith(false);
  });

  it("按了之後第一次呼叫帶 join；成功（包括別人正在翻、這次沒做事）後就不再帶", async () => {
    const join = createJoinFlag();
    const call = fakeCall({ ...PROGRESS, busy: true });

    join.raise();
    await join.send(call);
    await join.send(call);

    expect(call.mock.calls).toEqual([[true], [false]]);
  });

  it("回應是錯誤（金鑰無效、額度用完）_留著：處理好後按「繼續翻譯」，那次成功才加入", async () => {
    const join = createJoinFlag();
    const failing = fakeCall({ actionError: "API Key 無效", needsSettings: true });
    const call = fakeCall();

    join.raise();
    await join.send(failing);
    await join.send(call);
    await join.send(call);

    expect(failing).toHaveBeenCalledWith(true);
    expect(call.mock.calls).toEqual([[true], [false]]);
  });

  it("伺服器回報當場加進他保留的影片（saved）_通知觀看頁，頻道列的「保留」不重新整理就改成「已保留」", async () => {
    const onSaved = vi.fn();
    const join = createJoinFlag(onSaved);

    join.raise();
    await join.send(fakeCall({ ...PROGRESS, saved: true }));

    expect(onSaved).toHaveBeenCalledOnce();
  });

  it("清單滿了而且都是手動保留的（自動加入略過，回應沒有 saved）、或回應是錯誤_不通知，按鈕維持「保留」", async () => {
    const onSaved = vi.fn();
    const join = createJoinFlag(onSaved);

    join.raise();
    await join.send(fakeCall({ actionError: "API Key 無效", needsSettings: true }));
    await join.send(fakeCall());

    expect(onSaved).not.toHaveBeenCalled();
  });

  it("呼叫丟例外（斷線、部署後找不到 Server Action）_留著，重試時再帶", async () => {
    const join = createJoinFlag();
    const call = fakeCall();

    join.raise();
    await expect(join.send(async () => Promise.reject(new Error("network")))).rejects.toThrow("network");
    await join.send(call);

    expect(call).toHaveBeenCalledWith(true);
  });
});
