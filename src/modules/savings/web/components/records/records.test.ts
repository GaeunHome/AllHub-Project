import { Fragment, createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RecordItem } from "../../record-filter";

// 視窗與選單關著時不算繪內容 換成直接算繪才看得到修改的表單與刪除鈕
vi.mock("@/core/ui/dialog", { spy: true });
vi.mock("@/core/ui/more-menu", () => ({ MoreMenu: ({ label, children }: { label: string; children: ReactNode }) => createElement("div", { "data-menu": label }, children) }));
// 刪除鈕 要看交給它的 action 與確認訊息
vi.mock("@/core/ui/action-button", { spy: true });
vi.mock("../../actions", () => ({ deleteTransactionAction: vi.fn(), updateTransactionAction: vi.fn(), addTransactionAction: vi.fn() }));

const dialog = await import("@/core/ui/dialog");
const { ActionButton } = await import("@/core/ui/action-button");
const actions = await import("../../actions");
const { RecordRow } = await import("./record-row");
const { RecordList } = await import("./record-list");

const TODAY = "2026-10-14";
const ACCOUNTS = [
  { id: 1, name: "國泰", kind: "deposit" as const, active: true },
  { id: 2, name: "郵局", kind: "deposit" as const, active: true },
  { id: 9, name: "舊帳戶", kind: "deposit" as const, active: false },
  { id: 3, name: "國泰信用卡", kind: "credit" as const, active: true },
];
const CATEGORIES = [
  { id: 11, name: "餐飲", kind: "expense" as const, color: "orange" as const },
  { id: 21, name: "薪水", kind: "income" as const, color: "green" as const },
];
let nextId = 100;
const record = (fields: Partial<RecordItem>): RecordItem => ({
  id: nextId++,
  kind: "expense",
  accountId: 1,
  accountName: "國泰",
  counterAccountId: null,
  counterAccountName: null,
  categoryId: 11,
  categoryName: "餐飲",
  categoryColor: "orange",
  amount: 120,
  date: TODAY,
  note: "午餐",
  recurring: false,
  ...fields,
});
const LUNCH = record({ id: 70 });
const SALARY = record({ kind: "income", categoryId: 21, categoryName: "薪水", categoryColor: "green", amount: 43000, date: "2026-10-05", note: null, recurring: true });
const TRANSFER = record({ kind: "transfer", counterAccountId: 2, counterAccountName: "郵局", categoryId: null, categoryName: null, categoryColor: null, amount: 2500, date: "2026-10-05", note: "發薪分配" });
const ADJUST = record({ kind: "adjust", accountId: 2, accountName: "郵局", categoryId: null, categoryName: null, categoryColor: null, amount: -350, date: "2026-10-03", note: null });

const textOf = (markup: string) => markup.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&");
const onDeleted = vi.fn();
const row = (item: RecordItem) => renderToStaticMarkup(createElement("ul", null, createElement(RecordRow, { record: item, accounts: ACCOUNTS, categories: CATEGORIES, today: TODAY, onDeleted })));
/** 選單裡的刪除鈕 也就是 ActionButton 收到的 props */
const deleteButton = () => vi.mocked(ActionButton).mock.calls.find(([props]) => String(props.className).includes("menu-item-danger"))![0];

beforeEach(() => {
  vi.mocked(dialog.useDialogForm).mockClear();
  vi.mocked(ActionButton).mockClear();
  vi.mocked(actions.deleteTransactionAction).mockReset();
  onDeleted.mockClear();
  vi.mocked(dialog.Dialog).mockImplementation(({ children }) => createElement(Fragment, null, children));
});

describe("紀錄的一列", () => {
  it("支出：分類名稱、帳戶與備註、帶 - 的金額；「修改」念得出是哪一筆", () => {
    const markup = row(LUNCH);

    expect(textOf(markup)).toContain("餐飲");
    expect(textOf(markup)).toContain("國泰 · 午餐");
    expect(markup).toMatch(/class="[^"]*tabular-nums[^"]*text-ink">-\$120</);
    expect(markup).toMatch(/aria-label="修改：餐飲 -\$120"/);
  });

  it("收入是 + 而且用綠色；固定收支自動記的標「自動」", () => {
    const markup = row(SALARY);

    expect(markup).toMatch(/text-success">\+\$43,000</);
    expect(textOf(markup)).toContain("自動");
  });

  it("轉帳：名稱寫出從哪裡轉到哪裡（下面不再重複帳戶），金額不帶符號、中性的顏色", () => {
    const markup = row(TRANSFER);

    expect(textOf(markup)).toContain("國泰 → 郵局");
    expect(textOf(markup)).toContain("發薪分配");
    expect(textOf(markup)).not.toContain("國泰 · ");
    expect(markup).toMatch(/text-ink-soft">\$2,500</);
  });

  it("修改的視窗：帶入這筆紀錄、送到 updateTransactionAction", () => {
    const markup = row(LUNCH);

    expect(markup).toMatch(/<input type="hidden" name="id" value="70"/);
    expect(vi.mocked(dialog.useDialogForm).mock.calls.map(([action]) => action)).toEqual([actions.updateTransactionAction]);
  });

  it("修改舊紀錄：選項只多列它自己停用了的帳戶，其他停用的不列", () => {
    expect(row(record({ accountId: 9, accountName: "舊帳戶" }))).toContain("舊帳戶（已停用）");
    expect(row(LUNCH)).not.toContain("舊帳戶");
  });

  it("調整：不能修改（沒有打開視窗的按鈕，留一個看不見的佔位讓金額對齊），選單裡說明可以刪除後再更新一次", () => {
    const markup = row(ADJUST);

    expect(textOf(markup)).toContain("調整");
    expect(markup).not.toContain('aria-haspopup="dialog"');
    expect(markup).toMatch(/<span aria-hidden="true" class="invisible btn-ghost btn-sm/);
    expect(textOf(markup)).toContain("更新餘額的調整不能修改");
    expect(dialog.useDialogForm).not.toHaveBeenCalled();
  });

  it("信用卡的調整：叫「調整未繳」，金額照未繳的方向寫（餘額 +480 是未繳 -$480，不會讀成欠更多）", () => {
    const markup = row(record({ kind: "adjust", accountId: 3, accountName: "國泰信用卡", categoryId: null, categoryName: null, categoryColor: null, amount: 480, note: null }));

    expect(textOf(markup)).toContain("調整未繳");
    expect(markup).toMatch(/text-ink-soft">-\$480</);
  });

  it("刪除收在 ⋮ 選單：先確認（寫出日期、名稱與金額，括號不疊在一起），送到 deleteTransactionAction", () => {
    const markup = row(LUNCH);

    expect(markup).toMatch(/data-menu="「餐飲」-\$120 的選項"/);
    expect(markup).toMatch(/<input type="hidden" name="id" value="70"\/><button type="submit" class="menu-item menu-item-danger">/);
    expect(textOf(markup)).toContain("刪除這筆紀錄");
    expect(deleteButton().confirmMessage).toBe("確定刪除 10 月 14 日（三）的「餐飲 -$120」？刪除後無法復原。");
  });

  it("刪除成功：這一列會跟選單一起消失，訊息交給清單上方（伺服器沒給訊息時寫出刪了哪一筆）", async () => {
    vi.mocked(actions.deleteTransactionAction).mockResolvedValue({});
    row(LUNCH);
    const data = new FormData();
    data.set("id", "70");

    expect(await deleteButton().action({}, data)).toEqual({});
    expect(actions.deleteTransactionAction).toHaveBeenCalledWith({}, data);
    expect(onDeleted).toHaveBeenCalledWith("已刪除：餐飲 -$120");
  });

  it("刪除失敗：錯誤留在選單裡，不交給清單上方", async () => {
    vi.mocked(actions.deleteTransactionAction).mockResolvedValue({ error: "刪除紀錄失敗（詳見伺服器 log）" });
    row(LUNCH);

    expect(await deleteButton().action({}, new FormData())).toEqual({ error: "刪除紀錄失敗（詳見伺服器 log）" });
    expect(onDeleted).not.toHaveBeenCalled();
  });
});

describe("紀錄清單", () => {
  const list = (records: RecordItem[], monthLabel = "本月", initialCategory?: string) =>
    renderToStaticMarkup(createElement(RecordList, { records, accounts: ACCOUNTS, categories: CATEGORIES, today: TODAY, monthLabel, initialCategory }));
  const selected = (markup: string, label: string) => markup.match(new RegExp(`<select aria-label="${label}"[^>]*>[\\s\\S]*?</select>`))?.[0].match(/<option[^>]*selected=""[^>]*>([^<]*)</)?.[1];

  it("依日期分組、新的在前，今天那一組標「今天」；日期是頁首（h1）下一層的 h2，區段以它命名", () => {
    const markup = list([LUNCH, SALARY, TRANSFER, ADJUST]);
    const text = textOf(markup);

    expect(text.indexOf("10 月 14 日（三）今天")).toBeGreaterThanOrEqual(0);
    expect(text.indexOf("10 月 14 日")).toBeLessThan(text.indexOf("10 月 5 日（一）"));
    expect(text.indexOf("10 月 5 日")).toBeLessThan(text.indexOf("10 月 3 日（六）"));
    expect(markup).toMatch(/<section aria-labelledby="(fin-day-2026-10-14)"><h2 id="\1"/);
    expect(markup).not.toContain("<h3");
  });

  it("篩選：帳戶（停用的也列，標出來）、分類（依支出收入分組，還有未分類）、類型（含調整）", () => {
    const markup = list([LUNCH]);

    expect(markup).toMatch(/<select aria-label="帳戶"[\s\S]*舊帳戶（已停用）/);
    expect(markup).toMatch(/<optgroup label="支出"><option value="11">餐飲<\/option><\/optgroup><optgroup label="收入"><option value="21">薪水<\/option><\/optgroup><option value="uncategorized">未分類<\/option>/);
    expect(markup).toMatch(/<select aria-label="類型"[\s\S]*調整/);
  });

  it("從總覽點支出圓餅圖的一片連過來（?category=）：一開始就篩選那個分類", () => {
    const markup = list([LUNCH, SALARY, TRANSFER], "本月", "21");

    expect(selected(markup, "分類")).toBe("薪水");
    expect(textOf(markup)).toContain("篩選後 1 筆（共 3 筆）");
    expect(textOf(markup)).not.toContain("午餐");
  });

  it("未分類那一片連過來：篩選未分類", () => {
    const UNSORTED = record({ categoryId: null, categoryName: null, categoryColor: null, note: "高鐵票" });

    const markup = list([LUNCH, UNSORTED], "本月", "uncategorized");

    expect(selected(markup, "分類")).toBe("未分類");
    expect(textOf(markup)).toContain("高鐵票");
    expect(textOf(markup)).not.toContain("午餐");
  });

  it("合計只算收入與支出（轉帳與調整不算）；合計的名稱寫出是哪個月、或是篩選後的（dl 沒有角色，不加 aria-label）", () => {
    const markup = list([LUNCH, SALARY, TRANSFER, ADJUST]);
    const text = textOf(markup);

    expect(text).toContain("本月收入$43,000");
    expect(text).toContain("本月支出$120");
    expect(markup).toMatch(/<dl class="/);
    expect(markup).not.toMatch(/<dl[^>]*aria-label/);
    expect(textOf(list([LUNCH, SALARY], "本月", "11"))).toContain("篩選後的支出$120");
  });

  it("刪除的訊息放在清單最上面（刪掉最後一筆、清單換成空狀態時也在同一個位置）", () => {
    const messages = () => vi.mocked(dialog.DialogMessage).mock.calls.length;

    vi.mocked(dialog.DialogMessage).mockClear();
    list([LUNCH]);
    expect(messages()).toBeGreaterThan(0);

    vi.mocked(dialog.DialogMessage).mockClear();
    list([]);
    expect(messages()).toBe(1);
  });
});
