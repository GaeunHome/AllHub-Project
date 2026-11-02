import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { OTHER_SESSION, TEST_SESSION, requireSession } from "@/dev/session-stub";
import { insertTestUsers, setupTestDb } from "@/dev/test-db";
import { form, updated } from "@/dev/test-helpers";
import { allItems, insertItem, insertItems, itemsOf } from "../dev/fixtures";

vi.mock("@/core/auth", () => import("@/dev/session-stub"));

const { createReminderAction, deleteReminderAction, updateReminderAction } = await import("./actions");

const getDb = setupTestDb();

const FIELDS = { title: "繳房屋稅", date: "2026-11-30", notifyDaysBefore: "0" };
const NOT_FOUND = { error: "找不到這個提醒，請重新整理頁面" };

let alice: string;
let bob: string;

// 日期的判斷看今天 固定在台北 11/2 中午
beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-02T04:00:00Z"));
});
afterAll(() => {
  vi.useRealTimers();
});

beforeEach(async () => {
  [alice, bob] = await insertTestUsers(getDb());
  requireSession.mockReset().mockResolvedValue(TEST_SESSION);
});

describe("新增提醒的 Server Action", () => {
  it("沒登入時往外丟出導向登入頁：不寫入，快取不失效", async () => {
    requireSession.mockRejectedValue(new Error("NEXT_REDIRECT:/login"));

    await expect(createReminderAction({}, form(FIELDS))).rejects.toThrow("NEXT_REDIRECT");

    expect(await allItems(getDb())).toEqual([]);
    expect(updated()).toEqual([]);
  });

  it("寫給登入者：表單夾帶別人的 userId 也不理", async () => {
    requireSession.mockResolvedValue(OTHER_SESSION);

    const result = await createReminderAction({}, form({ ...FIELDS, userId: alice, user_id: alice }));

    expect(result).toEqual({ message: "已新增「繳房屋稅」" });
    expect(await itemsOf(getDb(), bob)).toMatchObject([{ title: "繳房屋稅", date: "2026-11-30", notifyDaysBefore: 0 }]);
    expect(await itemsOf(getDb(), alice)).toEqual([]);
  });

  it("表單的值不對：原因原樣顯示，快取不失效", async () => {
    expect(await createReminderAction({}, form({ ...FIELDS, date: "2026-11-01" }))).toEqual({ error: "日期不能早於今天" });
    expect(await createReminderAction({}, form({ ...FIELDS, title: "" }))).toEqual({ error: "請輸入標題" });
    expect(await createReminderAction({}, form({ title: "沒有帶日期與通知" }))).toEqual({ error: "請選擇正確的日期" });

    expect(updated()).toEqual([]);
  });

  it("滿 50 個：回中文的原因，快取不失效", async () => {
    await insertItems(getDb(), alice, 50, "2026-12-01");

    expect(await createReminderAction({}, form(FIELDS))).toEqual({ error: "提醒已滿 50 個，請先刪除一個" });
    expect(updated()).toEqual([]);
  });
});

describe("修改提醒的 Server Action", () => {
  it("沒登入時往外丟出導向登入頁：那一列不動", async () => {
    const hers = await insertItem(getDb(), alice, { date: "2026-11-30" });
    requireSession.mockRejectedValue(new Error("NEXT_REDIRECT:/login"));

    await expect(updateReminderAction({}, form({ ...FIELDS, id: String(hers.id), title: "被改了" }))).rejects.toThrow("NEXT_REDIRECT");

    expect(await itemsOf(getDb(), alice)).toEqual([hers]);
  });

  it("改自己的：寫入並回成功的訊息", async () => {
    const mine = await insertItem(getDb(), alice, { date: "2026-11-30" });

    expect(await updateReminderAction({}, form({ id: String(mine.id), title: "媽媽生日", date: "2026-12-24", notifyDaysBefore: "none" }))).toEqual({ message: "已儲存「媽媽生日」" });

    expect(await itemsOf(getDb(), alice)).toMatchObject([{ id: mine.id, title: "媽媽生日", date: "2026-12-24", notifyDaysBefore: null }]);
  });

  it("用 bob 的登入改 alice 的提醒（IDOR）：當作不存在、那一列不動，快取不失效", async () => {
    const hers = await insertItem(getDb(), alice, { date: "2026-11-30" });
    requireSession.mockResolvedValue(OTHER_SESSION);

    expect(await updateReminderAction({}, form({ ...FIELDS, id: String(hers.id), title: "被改了" }))).toEqual(NOT_FOUND);

    expect(await itemsOf(getDb(), alice)).toEqual([hers]);
    expect(updated()).toEqual([]);
  });

  // 2147483648 超過 serial 的範圍 直接查資料庫會丟錯
  it.each(["", "abc", "0", "-1", "1.5", "2147483648"])("id 的格式不對（%j）也是找不到：不寫入", async (id) => {
    const hers = await insertItem(getDb(), alice, { date: "2026-11-30" });

    expect(await updateReminderAction({}, form({ ...FIELDS, id, title: "被改了" }))).toEqual(NOT_FOUND);

    expect(await itemsOf(getDb(), alice)).toEqual([hers]);
  });
});

describe("刪除提醒的 Server Action", () => {
  it("沒登入時往外丟出導向登入頁：那一列不動", async () => {
    const hers = await insertItem(getDb(), alice, { date: "2026-11-30" });
    requireSession.mockRejectedValue(new Error("NEXT_REDIRECT:/login"));

    await expect(deleteReminderAction({}, form({ id: String(hers.id) }))).rejects.toThrow("NEXT_REDIRECT");

    expect(await itemsOf(getDb(), alice)).toEqual([hers]);
  });

  it("刪自己的：回成功的訊息", async () => {
    const mine = await insertItem(getDb(), alice, { title: "媽媽生日", date: "2026-11-30" });

    expect(await deleteReminderAction({}, form({ id: String(mine.id) }))).toEqual({ message: "已刪除「媽媽生日」" });

    expect(await itemsOf(getDb(), alice)).toEqual([]);
  });

  it("用 bob 的登入刪 alice 的提醒（IDOR）：當作不存在、那一列不動，快取不失效", async () => {
    const hers = await insertItem(getDb(), alice, { date: "2026-11-30" });
    requireSession.mockResolvedValue(OTHER_SESSION);

    expect(await deleteReminderAction({}, form({ id: String(hers.id) }))).toEqual(NOT_FOUND);

    expect(await itemsOf(getDb(), alice)).toEqual([hers]);
    expect(updated()).toEqual([]);
  });

  it("id 的格式不對也是找不到", async () => {
    expect(await deleteReminderAction({}, form({ id: "abc" }))).toEqual(NOT_FOUND);
    expect(await deleteReminderAction({}, form({ id: "2147483648" }))).toEqual(NOT_FOUND);
    expect(await deleteReminderAction({}, form({}))).toEqual(NOT_FOUND);
  });
});
