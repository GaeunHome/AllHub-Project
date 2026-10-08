import { refresh, revalidateTag, updateTag } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { form, mocksOf, updated } from "@/dev/test-helpers";

vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("../service/savings", { spy: true });

const { SavingsUserError } = await import("../service/savings");
const service = mocksOf(await import("../service/savings"), "createGoal", "updateGoal", "setGoalActive", "moveGoal", "deleteGoal", "addEntry", "deleteEntry");
const actions = await import("./actions");

const goal = { id: 1, name: "旅遊基金", monthlyAmount: 3000, note: null, active: true, sortOrder: 0, createdAt: new Date() };
const entry = { id: 7, month: "2026-10-01", goalId: 1, goalName: "旅遊基金", amount: 3000, note: null, createdAt: new Date() };

beforeEach(() => {
  for (const fn of Object.values(service)) fn.mockReset().mockResolvedValue(undefined);
  service.createGoal.mockResolvedValue(goal);
  service.updateGoal.mockResolvedValue(goal);
  service.addEntry.mockResolvedValue(entry);
  service.deleteEntry.mockResolvedValue("2026-09");
});

describe("存錢記帳的 Server Action：寫入後用 updateTag 讓對應的 tag 失效", () => {
  it.each([
    ["createGoalAction", ["savings:goals"], () => actions.createGoalAction({}, form({ name: "旅遊基金", monthlyAmount: "3000", note: "" }))],
    // 改名會同步紀錄上的名稱快照，每個月份的紀錄與累計都變了
    [
      "updateGoalAction",
      ["savings:entries", "savings:goals"],
      () => actions.updateGoalAction({}, form({ goalId: "1", name: "出國基金", monthlyAmount: "3000", note: "" })),
    ],
    ["setGoalActiveAction", ["savings:goals"], () => actions.setGoalActiveAction({}, form({ goalId: "1", active: "false" }))],
    ["moveGoalAction", ["savings:goals"], () => actions.moveGoalAction({}, form({ goalId: "1", direction: "up" }))],
    // 刪除項目時紀錄的 goal_id 改成 null，各月份紀錄改標「已刪除」
    ["deleteGoalAction", ["savings:entries", "savings:goals"], () => actions.deleteGoalAction({}, form({ goalId: "1" }))],
    // 只讓那個月份與累計失效，其他月份的快取留著
    [
      "addEntryAction",
      ["savings:month:2026-10", "savings:totals"],
      () => actions.addEntryAction({}, form({ goalId: "1", month: "2026-10", amount: "3000", note: "" })),
    ],
    ["deleteEntryAction", ["savings:month:2026-09", "savings:totals"], () => actions.deleteEntryAction({}, form({ entryId: "7" }))],
  ] as const)("%s_%j", async (_name, tags, run) => {
    await run();

    expect(updated()).toEqual([...tags].sort());
    expect(revalidateTag).not.toHaveBeenCalled();
    // updateTag 已經會讓這次回應帶著重新算繪的頁面，再呼叫 refresh 是多餘的
    expect(refresh).not.toHaveBeenCalled();
  });

  it("要刪的紀錄已經不在了_沒有寫入就不失效", async () => {
    service.deleteEntry.mockResolvedValue(null);

    await actions.deleteEntryAction({}, form({ entryId: "7" }));

    expect(updateTag).not.toHaveBeenCalled();
    // 沒有 updateTag 就不會重新算繪，靠 refresh 讓畫面拿掉那一列
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("輸入有誤（SavingsUserError）_沒有寫入就不失效", async () => {
    service.createGoal.mockRejectedValue(new SavingsUserError("每月金額要是 1 元到 1 億元的整數"));

    expect(await actions.createGoalAction({}, form({ name: "x", monthlyAmount: "0", note: "" }))).toEqual({ error: "每月金額要是 1 元到 1 億元的整數" });
    expect(updateTag).not.toHaveBeenCalled();
  });
});
