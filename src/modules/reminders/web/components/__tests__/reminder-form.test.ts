import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TEST_SESSION, requireSession } from "@/dev/session-stub";
import { markup as render, mocksOf, textOf } from "@/dev/test-helpers";
import type { ReminderItem } from "../../../service/items";

vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("../../../service/items", { spy: true });

const items = mocksOf(await import("../../../service/items"), "createItem", "updateItem");
const { createReminderAction, updateReminderAction } = await import("../../actions");
const { ReminderForm } = await import("../reminder-form");

const LIMITS = { today: "2026-11-02", latest: "2036-11-02" };
const ROW: ReminderItem = { id: 7, title: "繳房屋稅", date: "2026-11-30", notifyDaysBefore: null };

const formMarkup = (item?: ReminderItem) => render(createElement(ReminderForm, { item, ...LIMITS, onDone: vi.fn(), onCancel: vi.fn() }));

/** 照瀏覽器送出表單的規則 欄位送預填的值 下拉選單送選中的那一個 沒標選中時是第一個 */
function submitted(markup: string): FormData {
  const data = new FormData();
  for (const [, attrs] of markup.matchAll(/<input ([^>]*?)\/?>/g)) {
    const name = attrs.match(/name="([^"]*)"/)?.[1];
    if (name) data.append(name, attrs.match(/value="([^"]*)"/)?.[1] ?? "");
  }
  for (const [, name, options] of markup.matchAll(/<select[^>]*name="([^"]*)"[^>]*>(.*?)<\/select>/g)) {
    data.append(name, options.match(/<option value="([^"]*)" selected="">/)?.[1] ?? options.match(/<option value="([^"]*)"/)?.[1] ?? "");
  }
  return data;
}

const selectedOption = (markup: string) => textOf(markup.match(/<option[^>]*selected=""[^>]*>[^<]*<\/option>/)?.[0] ?? "");
const dateInput = (markup: string) => markup.match(/<input[^>]*type="date"[^>]*>/)?.[0] ?? "";

beforeEach(() => {
  requireSession.mockResolvedValue(TEST_SESSION);
  items.createItem.mockReset().mockResolvedValue({ ...ROW, title: "新的" });
  items.updateItem.mockReset().mockResolvedValue(ROW);
});

describe("新增與修改提醒的表單", () => {
  it("新增時通知預設「當天」，不動直接送出就是當天", async () => {
    const markup = formMarkup();

    expect(selectedOption(markup)).toBe("當天");

    const data = submitted(markup);
    data.set("title", "新的");
    data.set("date", "2026-11-30");
    await createReminderAction({}, data);
    expect(items.createItem.mock.calls[0][1]).toEqual({ title: "新的", date: "2026-11-30", notify: "0" });
  });

  it("標題的字數交給伺服器：瀏覽器的 maxLength 算 UTF-16 單位，一個 emoji 算兩個，20 個 emoji 就打不下去，規則卻是 30 字", () => {
    const input = formMarkup().match(/<input[^>]*name="title"[^>]*>/)?.[0];

    expect(input).toBeDefined();
    expect(input).not.toMatch(/maxlength/i);
  });

  it("日期是 date 欄位，最早只能選今天，最晚到 10 年後", () => {
    const input = dateInput(formMarkup());

    expect(input).toContain('min="2026-11-02"');
    expect(input).toContain('max="2036-11-02"');
  });

  it("修改時打開就是存好的內容：不通知的人直接儲存還是不通知，id 帶著這一列", async () => {
    const markup = formMarkup(ROW);

    expect(selectedOption(markup)).toBe("不通知");
    expect(dateInput(markup)).toContain('value="2026-11-30"');
    expect(markup).toContain('value="繳房屋稅"');

    await updateReminderAction({}, submitted(markup));
    expect(items.updateItem.mock.calls[0].slice(1, 3)).toEqual([7, { title: "繳房屋稅", date: "2026-11-30", notify: "none" }]);
  });

  it("有開通知的項目修改時選中原本的天數", () => {
    expect(selectedOption(formMarkup({ ...ROW, notifyDaysBefore: 14 }))).toBe("前 14 天");
    expect(selectedOption(formMarkup({ ...ROW, notifyDaysBefore: 0 }))).toBe("當天");
  });

  it("告訴使用者日期過了會自動刪除", () => {
    expect(textOf(formMarkup())).toContain("日期過了隔天會自動刪除");
  });
});
