import { refresh, updateTag } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireSession } from "@/dev/session-stub";
import { captureErrorLog, form, mocksOf } from "@/dev/test-helpers";

vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("../service/savings", { spy: true });

const { SavingsUserError } = await import("../service/savings");
const service = mocksOf(await import("../service/savings"), "createGoal", "updateGoal", "setGoalActive", "moveGoal", "deleteGoal", "addEntry", "deleteEntry");
const actions = await import("./actions");

const goal = { id: 1, name: "旅遊基金", monthlyAmount: 3000, note: null, active: true, sortOrder: 0, createdAt: new Date() };
const entry = { id: 7, month: "2026-10-01", goalId: 1, goalName: "旅遊基金", amount: 3000, note: null, createdAt: new Date() };

beforeEach(() => {
  requireSession.mockReset();
  for (const fn of Object.values(service)) fn.mockReset().mockResolvedValue(undefined);
  service.createGoal.mockResolvedValue(goal);
  service.updateGoal.mockResolvedValue(goal);
  service.addEntry.mockResolvedValue(entry);
  service.deleteEntry.mockResolvedValue("2026-10");
});

describe("登入檢查", () => {
  const cases: [string, (prev: object, data: FormData) => Promise<unknown>, Record<string, string>][] = [
    ["createGoalAction", actions.createGoalAction, { name: "旅遊基金", monthlyAmount: "3000", note: "" }],
    ["updateGoalAction", actions.updateGoalAction, { goalId: "1", name: "旅遊基金", monthlyAmount: "3000", note: "" }],
    ["setGoalActiveAction", actions.setGoalActiveAction, { goalId: "1", active: "false" }],
    ["moveGoalAction", actions.moveGoalAction, { goalId: "1", direction: "up" }],
    ["deleteGoalAction", actions.deleteGoalAction, { goalId: "1" }],
    ["addEntryAction", actions.addEntryAction, { goalId: "1", month: "2026-10", amount: "3000", note: "" }],
    ["deleteEntryAction", actions.deleteEntryAction, { entryId: "7" }],
  ];

  it.each(cases)("%s_沒登入_在動到資料前就被擋下", async (_name, action, fields) => {
    requireSession.mockRejectedValue(new Error("NEXT_REDIRECT"));

    await expect(action({}, form(fields))).rejects.toThrow("NEXT_REDIRECT");

    for (const fn of Object.values(service)) expect(fn).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
    expect(updateTag).not.toHaveBeenCalled();
  });

  it.each(cases)("%s_有登入_會執行並刷新畫面", async (_name, action, fields) => {
    expect(await action({}, form(fields))).not.toHaveProperty("error");
    expect(updateTag).toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("項目", () => {
  it("新增_把表單原樣交給 service 驗證_回傳成功訊息", async () => {
    const state = await actions.createGoalAction({}, form({ name: " 旅遊基金 ", monthlyAmount: "3,000", note: "日本" }));

    expect(service.createGoal).toHaveBeenCalledWith({ name: " 旅遊基金 ", monthlyAmount: "3,000", note: "日本" });
    expect(state).toEqual({ message: "已新增「旅遊基金」，每月 $3,000" });
  });

  it("修改_帶 id 給 service", async () => {
    await actions.updateGoalAction({}, form({ goalId: "1", name: "日本旅遊", monthlyAmount: "6000", note: "" }));

    expect(service.updateGoal).toHaveBeenCalledWith(1, { name: "日本旅遊", monthlyAmount: "6000", note: "" });
  });

  it.each([
    ["true", true],
    ["false", false],
  ])("啟用開關 active=%s_交給 service 的是 %s", async (raw, expected) => {
    await actions.setGoalActiveAction({}, form({ goalId: "1", active: raw }));

    expect(service.setGoalActive).toHaveBeenCalledWith(1, expected);
  });

  it.each(["abc", "0", "-1", "1.5", ""])("id 是 %j_回錯誤_不呼叫 service", async (goalId) => {
    const states = [
      await actions.updateGoalAction({}, form({ goalId, name: "x", monthlyAmount: "1", note: "" })),
      await actions.setGoalActiveAction({}, form({ goalId, active: "true" })),
      await actions.moveGoalAction({}, form({ goalId, direction: "up" })),
      await actions.deleteGoalAction({}, form({ goalId })),
    ];

    for (const state of states) expect(state.error).toBeTruthy();
    for (const fn of Object.values(service)) expect(fn).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("移動方向不是 up／down_回錯誤_不呼叫 service", async () => {
    const state = await actions.moveGoalAction({}, form({ goalId: "1", direction: "left" }));

    expect(state.error).toBeTruthy();
    expect(service.moveGoal).not.toHaveBeenCalled();
  });
});

describe("紀錄", () => {
  it("記錄項目_帶項目 id、月份、金額_回傳成功訊息", async () => {
    const state = await actions.addEntryAction({}, form({ goalId: "1", month: "2026-10", amount: "3000", note: "" }));

    expect(service.addEntry).toHaveBeenCalledWith({ goalId: 1, month: "2026-10", amount: "3000", note: "" });
    expect(state).toEqual({ message: "已記錄 2026 年 10 月「旅遊基金」$3,000" });
  });

  it("沒有項目 id_當成臨時存款", async () => {
    service.addEntry.mockResolvedValue({ ...entry, goalId: null, goalName: null, amount: 500 });

    const state = await actions.addEntryAction({}, form({ month: "2026-10", amount: "500", note: "發票中獎" }));

    expect(service.addEntry).toHaveBeenCalledWith({ goalId: null, month: "2026-10", amount: "500", note: "發票中獎" });
    expect(state).toEqual({ message: "已記錄 2026 年 10 月「臨時存款」$500" });
  });

  it("項目 id 格式不對_回錯誤_不會被當成臨時存款", async () => {
    const state = await actions.addEntryAction({}, form({ goalId: "abc", month: "2026-10", amount: "500", note: "" }));

    expect(state.error).toBeTruthy();
    expect(service.addEntry).not.toHaveBeenCalled();
  });

  it("刪除紀錄_id 不正確_回錯誤", async () => {
    expect((await actions.deleteEntryAction({}, form({}))).error).toBeTruthy();
    expect(service.deleteEntry).not.toHaveBeenCalled();
  });

  it("刪除紀錄_已經不在了（例如在別的裝置刪掉）_不失效快取_用 refresh 讓畫面拿掉那一列", async () => {
    service.deleteEntry.mockResolvedValue(null);

    expect(await actions.deleteEntryAction({}, form({ entryId: "7" }))).toEqual({});
    expect(updateTag).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalledOnce();
  });
});

describe("錯誤處理", () => {
  it("使用者輸入錯誤_直接顯示訊息_不刷新畫面", async () => {
    service.createGoal.mockRejectedValue(new SavingsUserError("請輸入項目名稱"));

    const state = await actions.createGoalAction({}, form({ name: "", monthlyAmount: "1", note: "" }));

    expect(state).toEqual({ error: "請輸入項目名稱" });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("非預期錯誤_回傳摘要_log 只記錯誤種類不記 message（可能含 SQL 與參數）", async () => {
    const log = captureErrorLog();
    const error = new Error('Failed query: insert into "savings_entries" params: secret-detail');
    error.name = "DrizzleQueryError";
    service.addEntry.mockRejectedValue(error);

    const state = await actions.addEntryAction({}, form({ goalId: "1", month: "2026-10", amount: "3000", note: "" }));

    expect(state).toEqual({ error: "記錄存款失敗（詳見伺服器 log）" });
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret-detail");
    expect(JSON.stringify(log.mock.calls)).toContain("DrizzleQueryError");
    expect(refresh).not.toHaveBeenCalled();
  });
});
