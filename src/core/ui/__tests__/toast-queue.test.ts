import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createToastApi, createToastQueue, resultToast, withToast, type ToastContent, type ToastQueue } from "../toast-queue";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const titles = (queue: ToastQueue) => queue.visible().map((toast) => toast.title);
const idOf = (queue: ToastQueue, title: string) => queue.visible().find((toast) => toast.title === title)!.id;

describe("提示視窗的佇列（toast-queue）", () => {
  it("同時最多 3 則：第 4 則先排隊，前面的收起後才出現在最下面", () => {
    const queue = createToastQueue();

    for (const title of ["已新增「餐飲」", "已新增「交通」", "已新增「薪水」", "已新增「獎金」"]) queue.show({ tone: "success", title });

    expect(titles(queue)).toEqual(["已新增「餐飲」", "已新增「交通」", "已新增「薪水」"]);
    queue.dismiss(idOf(queue, "已新增「餐飲」"));
    expect(titles(queue)).toEqual(["已新增「交通」", "已新增「薪水」", "已新增「獎金」"]);
  });

  it("成功 4 秒後自動收起，提醒與錯誤 8 秒", () => {
    const queue = createToastQueue();
    queue.show({ tone: "success", title: "已儲存" });
    queue.show({ tone: "warning", title: "已連結，建議一併貼上 ltmid_v2" });
    queue.show({ tone: "error", title: "兌換失敗" });

    vi.advanceTimersByTime(3999);
    expect(titles(queue)).toEqual(["已儲存", "已連結，建議一併貼上 ltmid_v2", "兌換失敗"]);
    vi.advanceTimersByTime(1);
    expect(titles(queue)).toEqual(["已連結，建議一併貼上 ltmid_v2", "兌換失敗"]);
    vi.advanceTimersByTime(3999);
    expect(titles(queue)).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(titles(queue)).toEqual([]);
  });

  it("排隊的那則從出現在畫面上才開始算時間：不會一出現就收起", () => {
    const queue = createToastQueue();
    for (const title of ["一", "二", "三"]) queue.show({ tone: "error", title });
    queue.show({ tone: "success", title: "四" });

    // 前三則 8 秒後一起收起 第四則這時才出現 再過 4 秒才收起
    vi.advanceTimersByTime(8000);
    expect(titles(queue)).toEqual(["四"]);
    vi.advanceTimersByTime(3999);
    expect(titles(queue)).toEqual(["四"]);
    vi.advanceTimersByTime(1);
    expect(titles(queue)).toEqual([]);
  });

  it("滑鼠移到上面時不收起；移開後把剩下的時間走完", () => {
    const queue = createToastQueue();
    queue.show({ tone: "success", title: "已儲存" });
    const id = idOf(queue, "已儲存");

    vi.advanceTimersByTime(3000);
    queue.hold(id, "hover");
    vi.advanceTimersByTime(60_000);
    expect(titles(queue)).toEqual(["已儲存"]);

    queue.release(id, "hover");
    vi.advanceTimersByTime(999);
    expect(titles(queue)).toEqual(["已儲存"]);
    vi.advanceTimersByTime(1);
    expect(titles(queue)).toEqual([]);
  });

  it("鍵盤移到上面時也不收起；滑鼠移開了但焦點還在，照樣留著，兩個都離開才繼續倒數", () => {
    const queue = createToastQueue();
    queue.show({ tone: "error", title: "刪除失敗" });
    const id = idOf(queue, "刪除失敗");

    queue.hold(id, "focus");
    queue.hold(id, "hover");
    queue.release(id, "hover");
    vi.advanceTimersByTime(60_000);
    expect(titles(queue)).toEqual(["刪除失敗"]);

    queue.release(id, "focus");
    vi.advanceTimersByTime(8000);
    expect(titles(queue)).toEqual([]);
  });

  it("沒有停過就放開（例如滑鼠只是經過另一則）：不會多算一次時間，照原本的時間收起", () => {
    const queue = createToastQueue();
    queue.show({ tone: "success", title: "已儲存" });

    queue.release(idOf(queue, "已儲存"), "hover");
    vi.advanceTimersByTime(4000);

    expect(titles(queue)).toEqual([]);
  });

  it("按關閉立刻收起，停著的也一樣；排隊的那則接著出現", () => {
    const queue = createToastQueue();
    for (const title of ["一", "二", "三", "四"]) queue.show({ tone: "success", title });
    const id = idOf(queue, "二");

    queue.hold(id, "hover");
    queue.dismiss(id);

    expect(titles(queue)).toEqual(["一", "三", "四"]);
  });

  it("畫面拿到的清單只在有變動時才換新的，並通知訂閱者（useSyncExternalStore 才不會一直重繪）", () => {
    const queue = createToastQueue();
    const listener = vi.fn();
    const unsubscribe = queue.subscribe(listener);
    const empty = queue.visible();

    expect(queue.visible()).toBe(empty);
    queue.show({ tone: "success", title: "已儲存" });
    expect(listener).toHaveBeenCalledOnce();
    const shown = queue.visible();
    expect(shown).not.toBe(empty);
    expect(queue.visible()).toBe(shown);

    unsubscribe();
    vi.advanceTimersByTime(4000);
    expect(listener).toHaveBeenCalledOnce();
  });
});

describe("給元件用的提示（createToastApi、resultToast）", () => {
  it("成功、提醒、錯誤各有各的樣子，標題寫結果、內容寫原因", () => {
    const shown: ToastContent[] = [];
    const toast = createToastApi((content) => void shown.push(content));

    toast.success("簽到成功，已累計 5 天");
    toast.warning("建議一併貼上 ltmid_v2，否則即時便箋可能失敗");
    toast.error("立即簽到失敗", "HoYoLAB cookie 已失效");

    expect(shown).toEqual([
      { tone: "success", title: "簽到成功，已累計 5 天" },
      { tone: "warning", title: "建議一併貼上 ltmid_v2，否則即時便箋可能失敗" },
      { tone: "error", title: "立即簽到失敗", body: "HoYoLAB cookie 已失效" },
    ]);
  });

  it("Server Action 的結果：錯誤用錯誤的樣子；成功用伺服器的訊息，沒有訊息時用預先寫好的那句；兩個都沒有就不跳", () => {
    expect(resultToast({ error: "刪除分類失敗（詳見伺服器 log）" }, "已刪除「餐飲」")).toEqual({ tone: "error", title: "刪除分類失敗（詳見伺服器 log）" });
    expect(resultToast({ message: "已刪除「餐飲」（伺服器）" }, "已刪除「餐飲」")).toEqual({ tone: "success", title: "已刪除「餐飲」（伺服器）" });
    expect(resultToast({}, "已刪除「餐飲」")).toEqual({ tone: "success", title: "已刪除「餐飲」" });
    expect(resultToast({})).toBeNull();
  });

  it("result 照著結果跳一則或不跳", () => {
    const shown: ToastContent[] = [];
    const toast = createToastApi((content) => void shown.push(content));

    toast.result({});
    toast.result({ message: "已續訂 3 個頻道" });

    expect(shown).toEqual([{ tone: "success", title: "已續訂 3 個頻道" }]);
  });

  it("包住 Server Action（withToast）：結果回來就跳，不等畫面；錯誤要對著欄位改的表單只跳成功，錯誤留給表單", async () => {
    const shown: ToastContent[] = [];
    const toast = createToastApi((content) => void shown.push(content));
    const fails = async () => ({ error: "請貼 YouTube 頻道網址" });
    const saves = async () => ({ message: "已追蹤「頻道」" });

    expect(await withToast(toast, fails)()).toEqual({ error: "請貼 YouTube 頻道網址" });
    await withToast(toast, async () => ({}), { fallback: "已刪除「餐飲」" })();
    await withToast(toast, fails, { errors: false })();
    await withToast(toast, saves, { errors: false })();

    expect(shown).toEqual([
      { tone: "error", title: "請貼 YouTube 頻道網址" },
      { tone: "success", title: "已刪除「餐飲」" },
      { tone: "success", title: "已追蹤「頻道」" },
    ]);
  });
});
