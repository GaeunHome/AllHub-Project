import { refresh, revalidateTag } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { form, mocksOf, updated } from "@/dev/test-helpers";

vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("../../service/items", { spy: true });

const items = mocksOf(await import("../../service/items"), "createItem", "updateItem", "deleteItem");
const { createReminderAction, deleteReminderAction, updateReminderAction } = await import("../actions");

const FIELDS = { title: "繳房屋稅", date: "2026-11-30", notifyDaysBefore: "0" };

beforeEach(() => {
  const row = { id: 1, title: "繳房屋稅", date: "2026-11-30", notifyDaysBefore: 0 };
  items.createItem.mockReset().mockResolvedValue(row);
  items.updateItem.mockReset().mockResolvedValue(row);
  items.deleteItem.mockReset().mockResolvedValue({ title: "繳房屋稅" });
});

describe("提醒的 Server Action：寫入後用 updateTag 讓對應的 tag 失效", () => {
  it.each([
    ["createReminderAction", ["reminders:items"], () => createReminderAction({}, form(FIELDS))],
    ["updateReminderAction", ["reminders:items"], () => updateReminderAction({}, form({ ...FIELDS, id: "1" }))],
    ["deleteReminderAction", ["reminders:items"], () => deleteReminderAction({}, form({ id: "1" }))],
  ] as const)("%s_%j", async (_name, tags, run) => {
    expect((await run()).error).toBeUndefined();

    expect(updated()).toEqual([...tags].sort());
    expect(revalidateTag).not.toHaveBeenCalled();
    // updateTag 已經會讓這次回應帶著重新算繪的頁面 再呼叫 refresh 是多餘的
    expect(refresh).not.toHaveBeenCalled();
  });
});
