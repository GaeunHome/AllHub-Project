import { Fragment, createElement, useReducer, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FormState } from "@/core/ui/form-message";

// 視窗關著時不算繪內容 換掉 Dialog 才看得到裡面 其他照原本的實作
vi.mock("@/core/ui/dialog", { spy: true });
// 一個按鈕的表單 要拿到交給它的 action
vi.mock("@/core/ui/action-button", { spy: true });
// 發薪分配要從打錯一行或分太多的狀態開始
// 只換掉那個 reducer 的初始狀態 其他照原本的實作
vi.mock("react", { spy: true });
// Server Action 換成假的 只看每個表單接到哪一個
vi.mock("../../actions", () => ({
  addTransactionAction: vi.fn(),
  updateTransactionAction: vi.fn(),
  updateBalanceAction: vi.fn(),
  allocateSalaryAction: vi.fn(),
  setupAction: vi.fn(),
  createAccountAction: vi.fn(),
  updateAccountAction: vi.fn(),
  createPurposeAction: vi.fn(),
  updatePurposeAction: vi.fn(),
  createCategoryAction: vi.fn(),
  updateCategoryAction: vi.fn(),
  createRecurringAction: vi.fn(),
  updateRecurringAction: vi.fn(),
}));

const dialog = await import("@/core/ui/dialog");
const { ActionButton } = await import("@/core/ui/action-button");
const actions = await import("../../actions");
const { lastAccountPref, lastSalaryAccountPref } = await import("../../last-used");
const { salaryFormReducer } = await import("../../form-math");
const { ROW_MESSAGE_CLASS } = await import("./fields");
const { QuickAddButton, QuickAddFab } = await import("./quick-add");
const { EntryForm } = await import("./entry-form");
const { UpdateBalanceButton } = await import("./update-balance");
const { SalaryButton } = await import("./salary-dialog");
const { SetupButton, SetupResultSlot } = await import("./setup-button");
const { AccountForm } = await import("./account-form");
const { PurposeForm } = await import("./purpose-form");
const { CategoryForm } = await import("./category-form");
const { RecurringForm } = await import("./recurring-form");

const TODAY = "2026-10-14";
const ACCOUNTS = [
  { id: 1, name: "國泰", kind: "deposit" as const },
  { id: 2, name: "郵局", kind: "deposit" as const },
  { id: 3, name: "國泰信用卡", kind: "credit" as const },
];
const CATEGORIES = [
  { id: 11, name: "餐飲", kind: "expense" as const, color: "orange" as const },
  { id: 12, name: "交通", kind: "expense" as const, color: "blue" as const },
  { id: 21, name: "薪水", kind: "income" as const, color: "green" as const },
];
const OPTIONS = { accounts: ACCOUNTS, categories: CATEGORIES, today: TODAY };
const done = { onDone: vi.fn(), onCancel: vi.fn() };
const { useReducer: realUseReducer } = await vi.importActual<typeof import("react")>("react");

const render = (element: ReactNode) => renderToStaticMarkup(element as never);
const textOf = (markup: string) => markup.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&");
const inputOf = (markup: string, name: string) => markup.match(new RegExp(`<input[^>]*name="${name}"[^>]*>`))?.[0] ?? "";
const inputsOf = (markup: string, name: string) => [...markup.matchAll(new RegExp(`<input[^>]*name="${name}"[^>]*>`, "g"))].map((m) => m[0]);
const selectOf = (markup: string, name: string) => markup.match(new RegExp(`<select[^>]*name="${name}"[^>]*>[\\s\\S]*?</select>`))?.[0] ?? "";
const selectedOption = (select: string) => select.match(/<option[^>]*selected=""[^>]*>([^<]*)<\/option>/)?.[1];
const fieldNames = (markup: string) => [...new Set([...markup.matchAll(/<(?:input|select|textarea)[^>]*name="([^"]+)"/g)].map((m) => m[1]))].sort();
const formActions = () => vi.mocked(dialog.useDialogForm).mock.calls.map(([action]) => action);
/** 視窗表單送完後交給 onDone 的那一段 是 useDialogForm 的第二個參數 */
const formOnDone = (index = 0) => vi.mocked(dialog.useDialogForm).mock.calls[index][1];
const messageClasses = () => vi.mocked(dialog.DialogMessage).mock.calls.map(([props]) => props.className);
const describedHint = (markup: string, name: string) => {
  const describedBy = inputOf(markup, name).match(/aria-describedby="([^"]+)"/)?.[1];
  return describedBy ? textOf(markup.match(new RegExp(`<p id="${describedBy}"[^>]*>([\\s\\S]*?)</p>`))?.[1] ?? "") : "";
};

beforeEach(() => {
  vi.mocked(dialog.useDialogForm).mockClear();
  vi.mocked(dialog.DialogMessage).mockClear();
  vi.mocked(ActionButton).mockClear();
  done.onDone.mockClear();
  vi.mocked(dialog.Dialog).mockImplementation(({ children }) => createElement(Fragment, null, children));
  lastAccountPref.save(0);
  lastSalaryAccountPref.save(0);
});

afterEach(() => {
  vi.mocked(useReducer).mockImplementation(realUseReducer as never);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("記一筆（快速記帳）", () => {
  it("還沒有任何帳戶_沒有地方可以記，按鈕與手機的＋都不顯示", () => {
    expect(render(createElement(QuickAddButton, { ...OPTIONS, accounts: [] }))).toBe("");
    expect(render(createElement(QuickAddFab, { ...OPTIONS, accounts: [] }))).toBe("");
  });

  it("視窗：支出／收入／轉帳的分段選擇（預設支出），金額是大的欄位、打開時先拿到焦點", () => {
    const markup = render(createElement(QuickAddButton, OPTIONS));

    expect(markup).toMatch(/role="group" aria-label="類型"/);
    expect(markup).toMatch(/aria-pressed="true"[^>]*>(?:<span[^>]*><\/span>)?支出<\/button>/);
    expect(inputOf(markup, "kind")).toContain('value="expense"');
    const amount = inputOf(markup, "amount");
    expect(amount).toContain("data-autofocus");
    expect(amount).toContain('inputMode="numeric"');
    expect(amount).toContain("text-2xl");
  });

  it("分類是點一下就選的膠囊：只列這個類型的分類（含色點），最後是預設選好的「未分類」", () => {
    const markup = render(createElement(QuickAddButton, OPTIONS));
    const chips = inputsOf(markup, "categoryId");

    expect(chips.map((chip) => chip.match(/value="([^"]*)"/)?.[1])).toEqual(["11", "12", ""]);
    expect(chips[2]).toContain("checked");
    expect(textOf(markup)).not.toContain("薪水");
  });

  it("收入：膠囊換成收入的分類", () => {
    const markup = render(createElement(QuickAddButton, { ...OPTIONS, defaultKind: "income" }));

    expect(inputsOf(markup, "categoryId").map((chip) => chip.match(/value="([^"]*)"/)?.[1])).toEqual(["21", ""]);
  });

  it("帳戶預設帶入：從帳戶卡片打開的優先，其次是上次用的，都沒有就用第一個", () => {
    expect(selectedOption(selectOf(render(createElement(QuickAddButton, OPTIONS)), "accountId"))).toBe("國泰");

    lastAccountPref.save(2);
    expect(selectedOption(selectOf(render(createElement(QuickAddButton, OPTIONS)), "accountId"))).toBe("郵局");
    expect(selectedOption(selectOf(render(createElement(QuickAddButton, { ...OPTIONS, accountId: 3 })), "accountId"))).toBe("國泰信用卡");
  });

  it("上次用的帳戶已經停用（不在選項裡）_改用第一個", () => {
    lastAccountPref.save(99);

    expect(selectedOption(selectOf(render(createElement(QuickAddButton, OPTIONS)), "accountId"))).toBe("國泰");
  });

  it("日期預設今天、不能選未來；備註有字數上限", () => {
    const markup = render(createElement(QuickAddButton, OPTIONS));

    expect(inputOf(markup, "date")).toMatch(/type="date"/);
    expect(inputOf(markup, "date")).toContain(`value="${TODAY}"`);
    expect(inputOf(markup, "date")).toContain(`max="${TODAY}"`);
    expect(inputOf(markup, "date")).toContain('min="2000-01-01"');
    expect(inputOf(markup, "note")).toContain('maxLength="200"');
  });

  it("帳戶開始記帳之前的日期不能選（伺服器也不收）；轉帳看兩個帳戶裡比較晚開始的", () => {
    const accounts = [
      { ...ACCOUNTS[0], startDate: "2026-09-01" },
      { ...ACCOUNTS[1], startDate: "2026-10-02" },
    ];

    expect(inputOf(render(createElement(QuickAddButton, { ...OPTIONS, accounts })), "date")).toContain('min="2026-09-01"');
    expect(inputOf(render(createElement(QuickAddButton, { ...OPTIONS, accounts, defaultKind: "transfer" })), "date")).toContain('min="2026-10-02"');
  });

  it("轉帳：沒有分類，改成「從」與「到」兩個帳戶，預設不會是同一個", () => {
    const markup = render(createElement(QuickAddButton, { ...OPTIONS, defaultKind: "transfer" }));

    expect(inputsOf(markup, "categoryId")).toEqual([]);
    expect(selectedOption(selectOf(markup, "accountId"))).toBe("國泰");
    expect(selectedOption(selectOf(markup, "counterAccountId"))).toBe("郵局");
  });

  it("只有一個帳戶時選轉帳_說明要兩個帳戶，送出鈕停用", () => {
    const markup = render(createElement(QuickAddButton, { ...OPTIONS, accounts: [ACCOUNTS[0]], defaultKind: "transfer" }));

    expect(textOf(markup)).toContain("要有兩個以上的帳戶才能轉帳");
    expect(markup).toMatch(/<button disabled="" class="btn-primary">/);
  });

  it("成功訊息獨佔所在那排按鈕的最後一整列，不把旁邊的按鈕拆開（總覽工具列、帳戶卡片）", () => {
    render(createElement(QuickAddButton, OPTIONS));

    expect(messageClasses()).toEqual([ROW_MESSAGE_CLASS]);
  });

  it("一整列的訊息：排在最後、佔滿寬度，對齊跟著那一排（靠右的工具列訊息也靠右，按鈕不會被擠到左邊）", () => {
    expect(ROW_MESSAGE_CLASS.split(" ")).toEqual(expect.arrayContaining(["basis-full", "order-last", "flex", "[justify-content:inherit]"]));
  });

  it("從信用卡的帳戶卡片打開、換成轉帳：繳卡費是存款轉到卡，卡是轉入；轉出是卡設定的扣款帳戶", () => {
    const accounts = [...ACCOUNTS.slice(0, 2), { ...ACCOUNTS[2], payFromAccountId: 2 }];
    const markup = render(createElement(QuickAddButton, { ...OPTIONS, accounts, accountId: 3, defaultKind: "transfer" }));

    expect(selectedOption(selectOf(markup, "accountId"))).toBe("郵局");
    expect(selectedOption(selectOf(markup, "counterAccountId"))).toBe("國泰信用卡");
  });

  it("記住這次用的帳戶（下次預設帶入）：只在記錄成功後，失敗時不記", async () => {
    render(createElement(EntryForm, { ...OPTIONS, action: actions.addTransactionAction, accountId: 2, remember: true, ...done }));
    const onDone = formOnDone();

    await dialog.dialogFormAction(async (): Promise<FormState> => ({ error: "金額至少 1 元" }), onDone)({}, new FormData());
    expect(lastAccountPref.read()).toBe(0);
    expect(done.onDone).not.toHaveBeenCalled();

    await dialog.dialogFormAction(async (): Promise<FormState> => ({ message: "已記錄：餐飲 $120（郵局）" }), onDone)({}, new FormData());
    expect(lastAccountPref.read()).toBe(2);
    expect(done.onDone).toHaveBeenCalledWith("已記錄：餐飲 $120（郵局）");
  });

  it("修改紀錄（不是快速記帳）_成功後也不改記住的帳戶", async () => {
    render(createElement(EntryForm, { ...OPTIONS, action: actions.updateTransactionAction, entry: { id: 70, kind: "expense", accountId: 2, counterAccountId: null, categoryId: 11, amount: 120, date: TODAY, note: null }, ...done }));

    await dialog.dialogFormAction(async (): Promise<FormState> => ({ message: "已儲存" }), formOnDone())({}, new FormData());

    expect(lastAccountPref.read()).toBe(0);
  });

  it("送到 addTransactionAction；帳戶卡片上的按鈕報讀器念得出是哪個帳戶（看得到的字也在名稱裡）", () => {
    const markup = render(createElement(QuickAddButton, { ...OPTIONS, accountId: 2, className: "btn-secondary btn-sm" }));

    expect(formActions()).toEqual([actions.addTransactionAction]);
    expect(markup).toMatch(/aria-label="記一筆：郵局"[^>]*class="btn-secondary btn-sm"/);
  });

  it("手機右下角的＋：寬螢幕不顯示、56px（至少 44px）、讓開 safe area；頁尾多留一段，最後的內容不會被蓋住", () => {
    const markup = render(createElement(QuickAddFab, OPTIONS));
    const fab = markup.match(/<button[^>]*aria-label="記一筆"[^>]*>/)?.[0] ?? "";

    expect(fab).toContain("fixed");
    expect(fab).toContain("sm:hidden");
    expect(fab).toContain("size-14");
    expect(fab).toContain("safe-area-inset-bottom");
    expect(markup).toMatch(/^<div aria-hidden="true" class="h-12 sm:hidden"><\/div>/);
    expect(formActions()).toEqual([actions.addTransactionAction]);
  });
});

describe("修改紀錄（紀錄頁的視窗）", () => {
  const entry = { id: 70, kind: "income" as const, accountId: 2, counterAccountId: null, categoryId: 21, amount: 43000, date: "2026-10-05", note: "十月" };

  it("帶入原本的類型、金額、分類、帳戶、日期與備註，送出時帶著紀錄的 id；按鈕是「儲存」", () => {
    const markup = render(createElement(EntryForm, { ...OPTIONS, action: actions.updateTransactionAction, entry, ...done }));

    expect(markup).toMatch(/<input type="hidden" name="id" value="70"/);
    expect(inputOf(markup, "kind")).toContain('value="income"');
    expect(inputOf(markup, "amount")).toContain('value="43000"');
    expect(inputsOf(markup, "categoryId").find((chip) => chip.includes('value="21"'))).toContain("checked");
    expect(selectedOption(selectOf(markup, "accountId"))).toBe("郵局");
    expect(inputOf(markup, "date")).toContain('value="2026-10-05"');
    expect(inputOf(markup, "note")).toContain('value="十月"');
    expect(textOf(markup)).toContain("儲存");
    expect(formActions()).toEqual([actions.updateTransactionAction]);
  });

  it("原本的帳戶已經停用：選項裡標出來、預設選它，儲存時不會默默換掉", () => {
    const accounts = [...ACCOUNTS, { id: 9, name: "舊帳戶", kind: "deposit" as const, active: false }];

    const markup = render(createElement(EntryForm, { ...OPTIONS, accounts, action: actions.updateTransactionAction, entry: { ...entry, accountId: 9 }, ...done }));

    expect(selectedOption(selectOf(markup, "accountId"))).toBe("舊帳戶（已停用）");
  });
});

describe("更新餘額", () => {
  it("存款：寫出記錄上的餘額，欄位問銀行 App 上的餘額，送到 updateBalanceAction（帶帳戶 id）", () => {
    const markup = render(createElement(UpdateBalanceButton, { account: { id: 1, name: "國泰", kind: "deposit", balance: 12000 } }));

    expect(textOf(markup)).toContain("記錄上的餘額$12,000");
    expect(textOf(markup)).toContain("銀行 App 上的餘額（元）");
    expect(markup).toMatch(/<input type="hidden" name="accountId" value="1"/);
    expect(inputOf(markup, "actual")).toContain("data-autofocus");
    expect(formActions()).toEqual([actions.updateBalanceAction]);
  });

  it("投資問目前市值；信用卡問目前未繳，記錄上的未繳是正數", () => {
    expect(textOf(render(createElement(UpdateBalanceButton, { account: { id: 4, name: "元大證券", kind: "investment", balance: 80000 } })))).toContain("銀行 App 上的目前市值（元）");

    const card = textOf(render(createElement(UpdateBalanceButton, { account: { id: 3, name: "國泰信用卡", kind: "credit", balance: -3500 } })));
    expect(card).toContain("記錄上的目前未繳$3,500");
    expect(card).toContain("銀行 App 上的目前未繳（元）");
  });

  it("按鈕預設是清單列裡的小按鈕；報讀器念得出是哪個帳戶", () => {
    const markup = render(createElement(UpdateBalanceButton, { account: { id: 1, name: "國泰", kind: "deposit", balance: 0 } }));

    expect(markup).toMatch(/aria-label="更新餘額：國泰" class="btn-secondary btn-sm"/);
  });

  it("成功訊息獨佔帳戶卡片那排按鈕的最後一整列", () => {
    render(createElement(UpdateBalanceButton, { account: { id: 1, name: "國泰", kind: "deposit", balance: 0 } }));

    expect(messageClasses()).toEqual([ROW_MESSAGE_CLASS]);
  });

  it("存款：只收數字，手機跳數字鍵盤", () => {
    const markup = render(createElement(UpdateBalanceButton, { account: { id: 1, name: "國泰", kind: "deposit", balance: 12000 } }));

    expect(inputOf(markup, "actual")).toContain('inputMode="numeric"');
  });

  it("信用卡：多繳時填負數（溢繳）；iPhone 的數字鍵盤沒有負號，所以不限定數字鍵盤，說明寫在欄位下面", () => {
    const markup = render(createElement(UpdateBalanceButton, { account: { id: 3, name: "國泰信用卡", kind: "credit", balance: -3500 } }));

    expect(inputOf(markup, "actual")).not.toContain("inputMode");
    expect(describedHint(markup, "actual")).toContain("多繳（溢繳）時填負數");
  });

  it("信用卡已經多繳（餘額是正的）：記錄上的數字寫成溢繳，不寫成 0", () => {
    const text = textOf(render(createElement(UpdateBalanceButton, { account: { id: 3, name: "國泰信用卡", kind: "credit", balance: 200 } })));

    expect(text).toContain("記錄上的目前未繳溢繳 $200");
  });
});

describe("發薪分配", () => {
  const salaryAccounts = [
    { id: 1, name: "國泰", kind: "deposit" as const, balance: 20000, monthlyPlan: null, targetAmount: null, sortOrder: 1 },
    { id: 2, name: "郵局", kind: "deposit" as const, balance: 95000, monthlyPlan: 10000, targetAmount: 100000, sortOrder: 2 },
    { id: 4, name: "元大證券", kind: "investment" as const, balance: 0, monthlyPlan: 3000, targetAmount: null, sortOrder: 3 },
    { id: 5, name: "急用金", kind: "deposit" as const, balance: 60000, monthlyPlan: 2000, targetAmount: 50000, sortOrder: 4 },
    { id: 3, name: "國泰信用卡", kind: "credit" as const, balance: -3500, monthlyPlan: null, targetAmount: null, sortOrder: 5 },
  ];
  const salary = () => render(createElement(SalaryButton, { accounts: salaryAccounts, categories: CATEGORIES, today: TODAY }));

  it("只有信用卡（薪水沒有地方入帳）_不顯示", () => {
    expect(render(createElement(SalaryButton, { accounts: [salaryAccounts[4]], categories: CATEGORIES, today: TODAY }))).toBe("");
  });

  it("入帳帳戶只列存款與投資，預設是上次用的；分類預設「薪水」；送到 allocateSalaryAction", () => {
    lastSalaryAccountPref.save(4);
    const markup = salary();

    expect(selectOf(markup, "accountId")).not.toContain("國泰信用卡");
    expect(selectedOption(selectOf(markup, "accountId"))).toBe("元大證券");
    expect(selectedOption(selectOf(markup, "categoryId"))).toBe("薪水");
    expect(formActions()).toEqual([actions.allocateSalaryAction]);
  });

  it("每個有每月規劃的帳戶一行（帳戶 id 與金額成對送出），金額照建議、可以改；有目標的最多分到目標為止", () => {
    const markup = salary();

    expect(inputsOf(markup, "transferAccountId").map((input) => input.match(/value="(\d+)"/)?.[1])).toEqual(["2", "4", "5"]);
    // 郵局離目標只差 5,000 比每月規劃 10,000 少 急用金已經超過目標
    expect(inputsOf(markup, "transferAmount").map((input) => input.match(/value="(\d+)"/)?.[1])).toEqual(["5000", "3000", "0"]);
    expect(textOf(markup)).toContain("離目標只差 $5,000（每月規劃 $10,000）");
    expect(textOf(markup)).toContain("已達目標 $50,000，這次不用再轉");
  });

  it("成功訊息獨佔總覽工具列那排按鈕的最後一整列", () => {
    salary();

    expect(messageClasses()).toEqual([ROW_MESSAGE_CLASS]);
  });

  /** 從中間的狀態開始算繪 入帳帳戶是國泰 */
  const salaryWith = (state: { salaryText: string; edits: Record<number, string> }) => {
    vi.mocked(useReducer).mockImplementation(((reducer: unknown, ...rest: unknown[]) =>
      reducer === salaryFormReducer ? [{ receivingId: 1, ...state }, vi.fn()] : (realUseReducer as (...args: unknown[]) => unknown)(reducer, ...rest)) as never);
    return salary();
  };
  const submit = (markup: string) => markup.match(/<button(?:(?!<\/button>)[\s\S])*記錄並分配<\/button>/)?.[0] ?? "";

  it("某一行打錯（例如 1.5、-500）：那一行標成錯誤、寫出原因（報讀器在欄位上會念），送出鈕停用；不再當成 0 悄悄送出", () => {
    const markup = salaryWith({ salaryText: "43000", edits: { 4: "1.5" } });
    const line = inputsOf(markup, "transferAmount").find((input) => input.includes('value="1.5"')) ?? "";

    expect(line).toContain('aria-invalid="true"');
    expect(describedHint(markup.replace(line, line.replace('name="transferAmount"', 'name="bad"')), "bad")).toContain("只能是整數");
    expect(inputsOf(markup, "transferAmount").filter((input) => input.includes("aria-invalid"))).toHaveLength(1);
    expect(submit(markup)).toMatch(/^<button disabled=""/);
  });

  it("分出去的比薪水多：寫出多了多少，送出鈕停用", () => {
    const markup = salaryWith({ salaryText: "6000", edits: {} });

    expect(textOf(markup)).toContain("分出去的比薪水多：$2,000");
    expect(submit(markup)).toMatch(/^<button disabled=""/);
  });

  it("日期不能早於入帳帳戶與要轉進去的帳戶開始記帳的那天", () => {
    vi.mocked(useReducer).mockImplementation(((reducer: unknown, ...rest: unknown[]) =>
      reducer === salaryFormReducer ? [{ receivingId: 1, salaryText: "43000", edits: {} }, vi.fn()] : (realUseReducer as (...args: unknown[]) => unknown)(reducer, ...rest)) as never);
    const accounts = salaryAccounts.map((account) => ({ ...account, startDate: account.id === 4 ? "2026-10-10" : "2026-09-01" }));

    const markup = render(createElement(SalaryButton, { accounts, categories: CATEGORIES, today: TODAY }));

    expect(inputOf(markup, "date")).toContain('min="2026-10-10"');
  });

  it("都沒問題：寫出留在入帳帳戶的錢，可以送出", () => {
    const markup = salaryWith({ salaryText: "43,000", edits: { 2: "" } });

    expect(textOf(markup)).toContain("留在「國泰」：$40,000");
    expect(submit(markup)).not.toContain("disabled");
    expect(markup).not.toContain("aria-invalid");
  });
});

describe("開始使用", () => {
  const setupRun = () => vi.mocked(ActionButton).mock.calls[0][0].action;

  it("一個按鈕的表單，送到 setupAction", async () => {
    vi.mocked(actions.setupAction).mockResolvedValue({ message: "已建立 3 個用途、5 個分類" });
    vi.stubGlobal("window", { alert: vi.fn() });
    const markup = render(createElement(SetupButton));

    expect(markup).toMatch(/^<form/);
    expect(textOf(markup)).toContain("開始使用");
    expect(await setupRun()({}, new FormData())).toEqual({ message: "已建立 3 個用途、5 個分類" });
    expect(actions.setupAction).toHaveBeenCalledOnce();
  });

  it("成功後整張卡片會被伺服器拿掉：外面有留訊息的位置（SetupResultSlot）就交給它，不跳提示視窗", async () => {
    vi.mocked(actions.setupAction).mockResolvedValue({ message: "已建立 3 個用途、5 個分類" });
    const alert = vi.fn();
    vi.stubGlobal("window", { alert });

    render(createElement(SetupResultSlot, null, createElement(SetupButton)));
    await setupRun()({}, new FormData());

    expect(alert).not.toHaveBeenCalled();
  });

  it("外面沒有留訊息的位置_成功訊息改用提示視窗（跟 Twitch、YouTube 選單裡的刪除一樣），不會沒有回饋", async () => {
    vi.mocked(actions.setupAction).mockResolvedValue({ message: "已建立 3 個用途、5 個分類" });
    const alert = vi.fn();
    vi.stubGlobal("window", { alert });

    render(createElement(SetupButton));
    await setupRun()({}, new FormData());

    expect(alert).toHaveBeenCalledWith("已建立 3 個用途、5 個分類");
  });

  it("失敗_錯誤留在按鈕旁邊，不跳提示", async () => {
    vi.mocked(actions.setupAction).mockResolvedValue({ error: "建立預設的用途與分類失敗（詳見伺服器 log）" });
    const alert = vi.fn();
    vi.stubGlobal("window", { alert });

    render(createElement(SetupButton));

    expect(await setupRun()({}, new FormData())).toEqual({ error: "建立預設的用途與分類失敗（詳見伺服器 log）" });
    expect(alert).not.toHaveBeenCalled();
  });
});

describe("帳戶表單", () => {
  const payFromAccounts = [
    { id: 1, name: "國泰", active: true },
    { id: 2, name: "郵局", active: false },
    { id: 6, name: "台新", active: true },
    { id: 7, name: "舊戶頭", active: false },
  ];
  const card = { id: 3, name: "國泰信用卡", kind: "credit" as const, purposeId: null, openingBalance: -3500, openingCost: null, monthlyPlan: null, targetAmount: null, dueDay: 6, payFromAccountId: 2 };

  it("新增：先選類型（預設存款），存款有用途、起始餘額、每月規劃與目標；送到 createAccountAction", () => {
    const markup = render(createElement(AccountForm, { purposes: [{ id: 5, name: "生活費" }], payFromAccounts, ...done }));

    expect(inputOf(markup, "kind")).toContain('value="deposit"');
    expect(fieldNames(markup)).toEqual(["kind", "monthlyPlan", "name", "openingBalance", "purposeId", "targetAmount"]);
    expect(inputOf(markup, "name")).toContain("data-autofocus");
    expect(formActions()).toEqual([actions.createAccountAction]);
  });

  it("隱私：只有自己取的名稱與金額，沒有帳號、卡號這類欄位，也提醒不用填", () => {
    const markup = render(createElement(AccountForm, { purposes: [], payFromAccounts, ...done }));

    expect(fieldNames(markup).join(" ")).not.toMatch(/number|card|holder|account(?!Id)/i);
    expect(textOf(markup)).toContain("不用填帳號或卡號");
  });

  it("修改信用卡：類型不能改，未繳用正數帶入，有繳款日與扣款帳戶（只列存款、不列停用的，原本選的停用了也留著）", () => {
    const markup = render(createElement(AccountForm, { account: card, purposes: [], payFromAccounts, ...done }));

    expect(markup).toMatch(/<input type="hidden" name="id" value="3"/);
    expect(inputOf(markup, "kind")).toBe("");
    expect(textOf(markup)).toContain("信用卡帳戶（類型建立後不能改）");
    expect(inputOf(markup, "openingBalance")).toContain('value="3500"');
    expect(selectedOption(selectOf(markup, "dueDay"))).toBe("每月 6 日");
    expect(selectedOption(selectOf(markup, "payFromAccountId"))).toBe("郵局（已停用）");
    expect(textOf(selectOf(markup, "payFromAccountId"))).toBe("未設定國泰郵局（已停用）台新");
    expect(fieldNames(markup)).toEqual(["dueDay", "id", "name", "openingBalance", "payFromAccountId"]);
    expect(formActions()).toEqual([actions.updateAccountAction]);
  });

  it("新增信用卡：目前未繳可以填負數（溢繳），不限定數字鍵盤（iPhone 的數字鍵盤沒有負號），說明寫在欄位下面", () => {
    const markup = render(createElement(AccountForm, { purposes: [], payFromAccounts, ...done }));
    const credit = render(createElement(AccountForm, { account: { ...card, openingBalance: 200 }, purposes: [], payFromAccounts, ...done }));

    expect(inputOf(markup, "openingBalance")).toContain('inputMode="numeric"');
    expect(inputOf(credit, "openingBalance")).not.toContain("inputMode");
    expect(describedHint(credit, "openingBalance")).toContain("多繳（溢繳）時填負數");
  });

  it("修改溢繳的信用卡（起始餘額是正的）：起始未繳帶入負數，不會變成 0", () => {
    const markup = render(createElement(AccountForm, { account: { ...card, openingBalance: 200 }, purposes: [], payFromAccounts, ...done }));

    expect(inputOf(markup, "openingBalance")).toContain('value="-200"');
  });

  it("修改投資帳戶：有市值與成本（成本留空當成跟市值一樣）", () => {
    const markup = render(createElement(AccountForm, { account: { ...card, id: 4, kind: "investment", openingBalance: 80000, openingCost: 60000, dueDay: null, payFromAccountId: null }, purposes: [], payFromAccounts, ...done }));

    expect(inputOf(markup, "openingBalance")).toContain('value="80000"');
    expect(inputOf(markup, "openingCost")).toContain('value="60000"');
    expect(textOf(markup)).toContain("起始市值（元）");
  });
});

describe("用途與分類表單", () => {
  it("新增用途：名稱與七個顏色（預設選還沒用過的；灰色留給未分類與未設定用途）；送到 createPurposeAction", () => {
    const markup = render(createElement(PurposeForm, { defaultColor: "amber", ...done }));
    const colors = inputsOf(markup, "color");

    expect(colors.map((input) => input.match(/value="(\w+)"/)?.[1])).toEqual(["blue", "teal", "green", "amber", "orange", "rose", "violet"]);
    expect(colors.find((input) => input.includes('value="amber"'))).toContain("checked");
    expect(textOf(markup)).toContain("黃");
    expect(formActions()).toEqual([actions.createPurposeAction]);
  });

  it("修改以前存成灰色的用途或分類：灰色不能再選（伺服器不收），預先選好還沒用過的顏色，儲存才不會失敗", () => {
    const purpose = render(createElement(PurposeForm, { purpose: { id: 5, name: "生活費", color: "slate" }, defaultColor: "rose", ...done }));
    const category = render(createElement(CategoryForm, { category: { id: 14, name: "提領現金", kind: "expense", color: "slate", monthlyBudget: null }, defaultKind: "expense", defaultColor: "amber", ...done }));
    const checked = (markup: string) => inputsOf(markup, "color").filter((input) => input.includes("checked")).map((input) => input.match(/value="(\w+)"/)?.[1]);

    expect(checked(purpose)).toEqual(["rose"]);
    expect(checked(category)).toEqual(["amber"]);
  });

  it("修改：原本的顏色還能選就照原本的", () => {
    const markup = render(createElement(PurposeForm, { purpose: { id: 5, name: "生活費", color: "teal" }, defaultColor: "rose", ...done }));

    expect(inputsOf(markup, "color").find((input) => input.includes("checked"))).toContain('value="teal"');
  });

  it("修改用途：帶入名稱與顏色、送出時帶 id", () => {
    const markup = render(createElement(PurposeForm, { purpose: { id: 5, name: "生活費", color: "teal" }, defaultColor: "teal", ...done }));

    expect(markup).toMatch(/<input type="hidden" name="id" value="5"/);
    expect(inputOf(markup, "name")).toContain('value="生活費"');
    expect(formActions()).toEqual([actions.updatePurposeAction]);
  });

  it("新增分類：類型預設是設定頁正在看的那一類；支出有每月預算，收入沒有", () => {
    const expense = render(createElement(CategoryForm, { defaultKind: "expense", defaultColor: "rose", ...done }));
    const income = render(createElement(CategoryForm, { defaultKind: "income", defaultColor: "rose", ...done }));

    expect(inputOf(expense, "kind")).toContain('value="expense"');
    expect(inputOf(expense, "monthlyBudget")).not.toBe("");
    expect(inputOf(income, "kind")).toContain('value="income"');
    expect(inputOf(income, "monthlyBudget")).toBe("");
    expect(formActions()).toEqual([actions.createCategoryAction, actions.createCategoryAction]);
  });

  it("新增成功時把新分類的類型交給外面（設定頁正在看支出時新增了收入的分類，要切到收入才看得到）", () => {
    render(createElement(CategoryForm, { defaultKind: "income", defaultColor: "rose", ...done }));

    formOnDone()("已新增分類「獎金」", {});

    expect(done.onDone).toHaveBeenCalledWith("已新增分類「獎金」", "income");
  });

  it("修改分類：類型不能改，預算帶入", () => {
    const markup = render(createElement(CategoryForm, { category: { id: 11, name: "餐飲", kind: "expense", color: "orange", monthlyBudget: 6000 }, defaultKind: "expense", defaultColor: "orange", ...done }));

    expect(inputOf(markup, "kind")).toBe("");
    expect(inputOf(markup, "monthlyBudget")).toContain('value="6000"');
    expect(formActions()).toEqual([actions.updateCategoryAction]);
  });
});

describe("固定收支表單", () => {
  const rule = { id: 30, kind: "expense" as const, accountId: 1, counterAccountId: null, categoryId: 12, amount: 1280, dayOfMonth: 20, note: "月票", active: true, lastPostedMonth: "2026-10-01", createdAt: "2026-09-01T02:00:00.000Z" };

  it("新增：跟記帳一樣的類型、金額與分類，日期是每月幾日（預設今天的日期），下面寫出下次會記在哪天", () => {
    // 下次日期以伺服器給的台北今天為準 不看裝置的時鐘
    // 裝置已經是隔天或時區不同也要算得跟伺服器一樣
    vi.useFakeTimers({ now: new Date("2026-10-15T04:00:00Z"), toFake: ["Date"] });
    const markup = render(createElement(RecurringForm, { ...OPTIONS, ...done }));

    expect(selectedOption(selectOf(markup, "dayOfMonth"))).toBe("每月 14 日");
    expect(textOf(markup)).toContain("下次自動記：10 月 14 日（三）");
    expect(fieldNames(markup)).toEqual(["accountId", "amount", "categoryId", "dayOfMonth", "kind", "note"]);
    expect(formActions()).toEqual([actions.createRecurringAction]);
  });

  it("修改：帶入原本的內容；這個月已經記過，下次是下個月", () => {
    const markup = render(createElement(RecurringForm, { ...OPTIONS, rule, ...done }));

    expect(markup).toMatch(/<input type="hidden" name="id" value="30"/);
    expect(inputOf(markup, "amount")).toContain('value="1280"');
    expect(selectedOption(selectOf(markup, "dayOfMonth"))).toBe("每月 20 日");
    expect(textOf(markup)).toContain("下次自動記：11 月 20 日（五）");
    expect(formActions()).toEqual([actions.updateRecurringAction]);
  });

  it("月底的日期：說明沒有這一天的月份記在月底；停用的不寫下次日期", () => {
    expect(textOf(render(createElement(RecurringForm, { ...OPTIONS, rule: { ...rule, dayOfMonth: 31 }, ...done })))).toContain("沒有這一天的月份記在月底");
    expect(textOf(render(createElement(RecurringForm, { ...OPTIONS, rule: { ...rule, active: false }, ...done })))).toContain("已停用：恢復後才會自動記");
  });
});

describe("視窗裡的表單不用 <form action>", () => {
  it("給 <form> 的是 onSubmit（React 的 <form action> 送完一定清空欄位，失敗時打的字會不見）", () => {
    const forms = [
      render(createElement(EntryForm, { ...OPTIONS, action: actions.addTransactionAction, ...done })),
      render(createElement(UpdateBalanceButton, { account: { id: 1, name: "國泰", kind: "deposit", balance: 0 } })),
      render(createElement(AccountForm, { purposes: [], payFromAccounts: [], ...done })),
      render(createElement(PurposeForm, { defaultColor: "blue", ...done })),
      render(createElement(CategoryForm, { defaultKind: "expense", defaultColor: "blue", ...done })),
      render(createElement(RecurringForm, { ...OPTIONS, ...done })),
    ];

    for (const markup of forms) expect(markup).toMatch(/<form(?![^>]*action=)[^>]*>/);
  });
});
