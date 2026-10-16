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
  { id: 1, name: "國泰", kind: "deposit" as const, active: true, startDate: "2026-01-05" },
  { id: 2, name: "郵局", kind: "deposit" as const, active: true },
  { id: 9, name: "舊帳戶", kind: "deposit" as const, active: false },
  { id: 3, name: "國泰信用卡", kind: "credit" as const, active: true },
  { id: 4, name: "臺銀證券", kind: "investment" as const, active: true, startDate: "2026-03-02" },
];
const CATEGORIES = [
  { id: 11, name: "餐飲", kind: "expense" as const },
  { id: 21, name: "薪水", kind: "income" as const },
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
  amount: 120,
  date: TODAY,
  note: "午餐",
  recurring: false,
  recurringName: null,
  shares: null,
  holdingSymbol: null,
  cardBillId: null,
  backToPending: false,
  ...fields,
});
const LUNCH = record({ id: 70 });
const SALARY = record({ kind: "income", categoryId: 21, categoryName: "薪水", amount: 43000, date: "2026-10-05", note: null, recurring: true, recurringName: "薪水" });
const TRANSFER = record({ kind: "transfer", counterAccountId: 2, counterAccountName: "郵局", categoryId: null, categoryName: null, amount: 2500, date: "2026-10-05", note: "發薪分配" });
const ADJUST = record({ kind: "adjust", accountId: 2, accountName: "郵局", categoryId: null, categoryName: null, amount: -350, date: "2026-10-03", note: null });
const BUY = record({ id: 80, kind: "transfer", counterAccountId: 4, counterAccountName: "臺銀證券", categoryId: null, categoryName: null, amount: 1000, date: "2026-10-08", note: "買進 006208 8 股", shares: 8, holdingSymbol: "006208", recurring: true, recurringName: "006208 定期定額" });

const textOf = (markup: string) => markup.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&");
const onDeleted = vi.fn();
const row = (item: RecordItem) => renderToStaticMarkup(createElement("ul", null, createElement(RecordRow, { record: item, accounts: ACCOUNTS, categories: CATEGORIES, today: TODAY, onDeleted })));
/** 整列是打開修改視窗的按鈕 報讀器先念修改 */
const rowButton = (markup: string) => markup.match(/<button[^>]*aria-haspopup="dialog"[^>]*>((?:(?!<\/button>)[\s\S])*)<\/button>/)?.[1];
const fieldNames = (markup: string) => [...new Set([...markup.matchAll(/<(?:input|select|textarea)[^>]*name="([^"]+)"/g)].map((m) => m[1]))].sort();
const hiddenValue = (markup: string, name: string) => markup.match(new RegExp(`<input type="hidden" name="${name}" value="([^"]*)"`))?.[1];
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
  it("點一列就是修改：名稱、帳戶與備註、帶 - 的金額都在按鈕裡，報讀器先念「修改」", () => {
    expect(textOf(rowButton(row(LUNCH)) ?? "")).toBe("修改：餐飲國泰 · 午餐-$120");
  });

  it("收入帶 +；固定收支記的寫規則的名稱（跟名稱重複時寫固定收支），是一般文字不是標籤", () => {
    const markup = row(SALARY);

    expect(textOf(rowButton(markup) ?? "")).toBe("修改：薪水國泰 · 固定收支+$43,000");
    expect(textOf(rowButton(row({ ...SALARY, recurringName: "十月薪水" })) ?? "")).toBe("修改：薪水國泰 · 十月薪水+$43,000");
    expect(markup).not.toContain('class="chip');
  });

  it("轉帳：名稱寫出從哪裡轉到哪裡（下面不再重複帳戶），金額不帶符號", () => {
    expect(textOf(rowButton(row(TRANSFER)) ?? "")).toBe("修改：國泰 → 郵局發薪分配$2,500");
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

  it("調整：不能修改（整列不是按鈕），選單裡說明可以刪除後再更新一次", () => {
    const markup = row(ADJUST);

    expect(textOf(markup)).toContain("調整");
    expect(rowButton(markup)).toBeUndefined();
    expect(textOf(markup)).toContain("更新餘額的調整不能修改");
    expect(dialog.useDialogForm).not.toHaveBeenCalled();
  });

  it("信用卡的調整：叫「調整未繳」，金額照未繳的方向寫（餘額 +480 是未繳 -$480，不會讀成欠更多）", () => {
    const text = textOf(row(record({ kind: "adjust", accountId: 3, accountName: "國泰信用卡", categoryId: null, categoryName: null, amount: 480, note: null })));

    expect(text).toContain("調整未繳");
    expect(text).toContain("-$480");
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

describe("買賣持股的紀錄", () => {
  it("一列寫「買進 006208 · 8 股」與從哪個帳戶到哪個帳戶、定期定額的名稱", () => {
    expect(textOf(rowButton(row(BUY)) ?? "")).toBe("修改：買進 006208 · 8 股國泰 → 臺銀證券 · 006208 定期定額$1,000");
  });

  it("修改的視窗只有日期與備註；金額、帳戶與類型原樣送回 updateTransactionAction（伺服器擋下其他改動）", () => {
    const markup = row(BUY);

    expect(fieldNames(markup)).toEqual(["accountId", "amount", "categoryId", "counterAccountId", "date", "id", "kind", "note"]);
    expect(markup).not.toMatch(/<input(?![^>]*type="hidden")[^>]*name="(amount|accountId|counterAccountId|kind)"/);
    expect(markup).not.toMatch(/<select[^>]*name=/);
    expect([hiddenValue(markup, "id"), hiddenValue(markup, "kind"), hiddenValue(markup, "accountId"), hiddenValue(markup, "counterAccountId"), hiddenValue(markup, "amount")]).toEqual(["80", "transfer", "1", "4", "1000"]);
    expect(markup).toMatch(/<input type="date"[^>]*name="date" value="2026-10-08"/);
    expect(vi.mocked(dialog.useDialogForm).mock.calls.map(([action]) => action)).toEqual([actions.updateTransactionAction]);
  });

  it("日期不能早於兩個帳戶裡比較晚開始記帳的那天，也不能是未來", () => {
    const date = row(BUY).match(/<input type="date"[^>]*>/)?.[0] ?? "";

    expect(date).toContain('min="2026-03-02"');
    expect(date).toContain(`max="${TODAY}"`);
  });

  it("刪除的確認說明持股會跟著還原", () => {
    row(BUY);

    expect(deleteButton().confirmMessage).toBe("確定刪除 10 月 8 日（四）的「買進 006208 · 8 股 $1,000」？持股的股數和成本會跟著還原。");
  });
});

describe("填帳單時補的紀錄", () => {
  const UNRECORDED = record({ id: 90, accountId: 3, accountName: "國泰信用卡", categoryId: null, categoryName: null, amount: 520, date: "2026-10-05", note: "未記錄的刷卡（帳單差額）", cardBillId: 4 });
  const BILL_ADJUST = record({ id: 91, kind: "adjust", accountId: 3, accountName: "國泰信用卡", categoryId: null, categoryName: null, amount: 300, date: "2026-10-05", note: "帳單差額", cardBillId: 4 });

  it("補的刷卡只能改分類和備註：金額、日期與帳戶原樣送回 updateTransactionAction（伺服器擋下其他改動）", () => {
    const markup = row(UNRECORDED);

    expect(fieldNames(markup)).toEqual(["accountId", "amount", "categoryId", "counterAccountId", "date", "id", "kind", "note"]);
    expect(markup).not.toMatch(/<input(?![^>]*type="(?:hidden|radio)")[^>]*name="(amount|date|accountId)"/);
    expect([hiddenValue(markup, "id"), hiddenValue(markup, "kind"), hiddenValue(markup, "accountId"), hiddenValue(markup, "amount"), hiddenValue(markup, "date")]).toEqual(["90", "expense", "3", "520", "2026-10-05"]);
    expect(vi.mocked(dialog.useDialogForm).mock.calls.map(([action]) => action)).toEqual([actions.updateTransactionAction]);
  });

  it("刪掉補的那一筆＝撤銷這張帳單：確認訊息照實說，待處理會再請你填帳單", () => {
    row(UNRECORDED);

    expect(deleteButton().confirmMessage).toContain("這張帳單會一起撤銷");
    expect(deleteButton().confirmMessage).not.toContain("無法復原");
  });

  it("帳單比紀錄少時補的調整不能修改，選單裡說明要重填帳單（不是更新餘額）", () => {
    const markup = row(BILL_ADJUST);

    expect(rowButton(markup)).toBeUndefined();
    expect(textOf(markup)).toContain("重填這一期的帳單");
    expect(textOf(markup)).not.toContain("更新餘額");
  });
});

describe("從待處理確認來的紀錄", () => {
  it("刪掉後那一期會回到總覽的待處理：確認訊息照實說，不說無法復原", () => {
    row({ ...SALARY, backToPending: true });

    expect(deleteButton().confirmMessage).toContain("這一期會回到總覽的待處理");
    expect(deleteButton().confirmMessage).not.toContain("無法復原");
  });

  it("定期定額買進的那一期：持股還原，那一期也回到待處理", () => {
    row({ ...BUY, backToPending: true });

    expect(deleteButton().confirmMessage).toContain("持股的股數和成本會跟著還原");
    expect(deleteButton().confirmMessage).toContain("這一期會回到總覽的待處理");
  });
});

describe("紀錄清單", () => {
  const MONTH_SWITCHER = createElement("nav", { "aria-label": "切換月份" }, "月份");
  const list = (records: RecordItem[], links: { initialAccount?: string; initialCategory?: string } = {}) =>
    renderToStaticMarkup(createElement(RecordList, { records, accounts: ACCOUNTS, categories: CATEGORIES, today: TODAY, monthSwitcher: MONTH_SWITCHER, monthLabel: "本月", ...links }));
  const selected = (markup: string, label: string) => markup.match(new RegExp(`<select aria-label="${label}"[^>]*>[\\s\\S]*?</select>`))?.[0].match(/<option[^>]*selected=""[^>]*>([^<]*)</)?.[1];

  it("工具列是月份切換與篩選；依日期分組、新的在前，今天那一組標「今天」；日期是頁首（h1）下一層的 h2", () => {
    const markup = list([LUNCH, BUY, SALARY, TRANSFER, ADJUST]);
    const text = textOf(markup);

    expect(markup.indexOf('aria-label="切換月份"')).toBeLessThan(markup.indexOf('aria-label="篩選紀錄"'));
    expect(text.indexOf("10 月 14 日（三）今天")).toBeGreaterThanOrEqual(0);
    expect(text.indexOf("10 月 14 日")).toBeLessThan(text.indexOf("10 月 8 日（四）"));
    expect(text.indexOf("10 月 8 日")).toBeLessThan(text.indexOf("10 月 5 日（一）"));
    expect(text.indexOf("10 月 5 日")).toBeLessThan(text.indexOf("10 月 3 日（六）"));
    expect(markup).toMatch(/<section aria-labelledby="([^"]+)"><h2 id="\1"/);
    expect(markup).not.toContain("<h3");
  });

  it("篩選：帳戶（停用的也列，標出來）、分類（依支出收入分組，還有未分類）、類型（含調整）", () => {
    const markup = list([LUNCH]);

    expect(markup).toMatch(/<select aria-label="帳戶"[\s\S]*舊帳戶（已停用）/);
    expect(markup).toMatch(/<optgroup label="支出"><option value="11">餐飲<\/option><\/optgroup><optgroup label="收入"><option value="21">薪水<\/option><\/optgroup><option value="uncategorized">未分類<\/option>/);
    expect(markup).toMatch(/<select aria-label="類型"[\s\S]*調整/);
  });

  it("從總覽的帳戶詳情連過來（?account=）：一開始就篩選那個帳戶，轉入與轉出都算", () => {
    const markup = list([LUNCH, BUY, TRANSFER, ADJUST], { initialAccount: "2" });

    expect(selected(markup, "帳戶")).toBe("郵局");
    expect(textOf(markup)).toContain("篩選後 2 筆（共 4 筆）");
    expect(textOf(markup)).not.toContain("午餐");
  });

  it("從總覽點本月支出的一個分類連過來（?category=）：一開始就篩選那個分類", () => {
    const markup = list([LUNCH, SALARY, TRANSFER], { initialCategory: "21" });

    expect(selected(markup, "分類")).toBe("薪水");
    expect(textOf(markup)).toContain("篩選後 1 筆（共 3 筆）");
    expect(textOf(markup)).not.toContain("午餐");
  });

  it("未分類連過來：篩選未分類", () => {
    const UNSORTED = record({ categoryId: null, categoryName: null, note: "高鐵票" });

    const markup = list([LUNCH, UNSORTED], { initialCategory: "uncategorized" });

    expect(selected(markup, "分類")).toBe("未分類");
    expect(textOf(markup)).toContain("高鐵票");
    expect(textOf(markup)).not.toContain("午餐");
  });

  it("下面一行寫收入與支出的合計：只算收入與支出（轉帳、買賣與調整不算），篩選後跟著篩選結果", () => {
    expect(textOf(list([LUNCH, BUY, SALARY, TRANSFER, ADJUST]))).toContain("收入 $43,000 · 支出 $120");
    expect(textOf(list([LUNCH, SALARY], { initialCategory: "11" }))).toContain("篩選後 1 筆（共 2 筆） · 收入 $0 · 支出 $120");
  });

  it("這個月沒有紀錄：寫一行字，沒有篩選與合計，月份切換還在", () => {
    const markup = list([]);

    expect(textOf(markup)).toContain("本月還沒有紀錄。");
    expect(markup).toContain('aria-label="切換月份"');
    expect(markup).not.toContain('aria-label="篩選紀錄"');
    expect(textOf(markup)).not.toContain("收入 $");
  });

  it("超寬螢幕的側欄寫這個月的合計與各分類的支出，不跟著篩選；正在篩選的分類標成按下", () => {
    const expenses = [
      { key: "category:11", name: "餐飲", spent: 120, budget: 6000, barPercent: 2, over: 0, category: "11", href: "/savings/records?category=11" },
      { key: "uncategorized", name: "未分類", spent: 30, budget: null, barPercent: null, over: 0, category: "uncategorized", href: "/savings/records?category=uncategorized" },
    ];
    const markup = renderToStaticMarkup(
      createElement(RecordList, { records: [LUNCH, SALARY], accounts: ACCOUNTS, categories: CATEGORIES, today: TODAY, monthSwitcher: MONTH_SWITCHER, monthLabel: "本月", month: { totals: { income: 43000, expense: 150, saved: 42850 }, expenses }, initialCategory: "11" }),
    );
    const panel = markup.slice(markup.indexOf('aria-labelledby="savings-month-panel"'));

    expect(textOf(panel)).toContain("收入$43,000支出$150存下$42,850");
    expect(panel).toMatch(/<button type="button" aria-pressed="true"[^>]*>(?:(?!<\/button>).)*餐飲/);
    expect(panel).toMatch(/<button type="button" aria-pressed="false"[^>]*>(?:(?!<\/button>).)*未分類/);
  });

  it("這個月花的比賺的多_寫「多花」多少，不寫負的存下", () => {
    const markup = renderToStaticMarkup(
      createElement(RecordList, { records: [LUNCH], accounts: ACCOUNTS, categories: CATEGORIES, today: TODAY, monthSwitcher: MONTH_SWITCHER, monthLabel: "本月", month: { totals: { income: 3000, expense: 12110, saved: -9110 }, expenses: [] } }),
    );

    expect(textOf(markup)).toContain("多花$9,110");
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
