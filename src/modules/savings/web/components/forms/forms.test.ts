import { Fragment, createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FormState } from "@/core/ui/form-message";

// 視窗關著時不算繪內容 換掉 Dialog 才看得到裡面 其他照原本的實作
vi.mock("@/core/ui/dialog", { spy: true });
// 一個按鈕的表單 要拿到交給它的 action
vi.mock("@/core/ui/action-button", { spy: true });
// Server Action 換成假的 只看每個表單接到哪一個
vi.mock("../../actions", () => ({
  addTransactionAction: vi.fn(),
  updateTransactionAction: vi.fn(),
  updateBalanceAction: vi.fn(),
  setupAction: vi.fn(),
  createAccountAction: vi.fn(),
  updateAccountAction: vi.fn(),
  createCategoryAction: vi.fn(),
  updateCategoryAction: vi.fn(),
  createRecurringAction: vi.fn(),
  updateRecurringAction: vi.fn(),
}));

const dialog = await import("@/core/ui/dialog");
const { ActionButton } = await import("@/core/ui/action-button");
const actions = await import("../../actions");
const { lastAccountPref } = await import("../../last-used");
const { ROW_MESSAGE_CLASS } = await import("./fields");
const { QuickAddButton } = await import("./quick-add");
const { EntryForm } = await import("./entry-form");
const { UpdateBalanceButton } = await import("./update-balance");
const { SetupButton, SetupResultSlot } = await import("./setup-button");
const { AccountForm } = await import("./account-form");
const { CategoryForm } = await import("./category-form");
const { RecurringForm } = await import("./recurring-form");
const { TradeForm } = await import("./trade-form");

const TODAY = "2026-10-14";
const ACCOUNTS = [
  { id: 1, name: "國泰", kind: "deposit" as const },
  { id: 2, name: "郵局", kind: "deposit" as const },
  { id: 3, name: "國泰信用卡", kind: "credit" as const },
];
const CATEGORIES = [
  { id: 11, name: "餐飲", kind: "expense" as const },
  { id: 12, name: "交通", kind: "expense" as const },
  { id: 21, name: "薪水", kind: "income" as const },
];
const OPTIONS = { accounts: ACCOUNTS, categories: CATEGORIES, today: TODAY };
const done = { onDone: vi.fn(), onCancel: vi.fn() };

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
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("記一筆（快速記帳）", () => {
  it("還沒有任何帳戶_沒有地方可以記，按鈕不顯示", () => {
    expect(render(createElement(QuickAddButton, { ...OPTIONS, accounts: [] }))).toBe("");
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

  it("分類是點一下就選的膠囊：只列這個類型的分類，最後是預設選好的「未分類」", () => {
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

  it("沒有持股的投資帳戶：按鈕是「更新市值」、問目前市值", () => {
    const investment = render(createElement(UpdateBalanceButton, { account: { id: 4, name: "元大證券", kind: "investment", balance: 80000 } }));
    expect(investment).toMatch(/aria-label="更新市值：元大證券"/);
    expect(textOf(investment)).toContain("銀行 App 上的目前市值（元）");
  });

  it("按鈕預設是清單列裡的小按鈕；報讀器念得出是哪個帳戶", () => {
    const markup = render(createElement(UpdateBalanceButton, { account: { id: 1, name: "國泰", kind: "deposit", balance: 0 } }));

    expect(markup).toMatch(/aria-label="更新餘額：國泰" class="btn-secondary btn-sm"/);
  });

  it("成功訊息獨佔帳戶卡片那排按鈕的最後一整列", () => {
    render(createElement(UpdateBalanceButton, { account: { id: 1, name: "國泰", kind: "deposit", balance: 0 } }));

    expect(messageClasses()).toEqual([ROW_MESSAGE_CLASS]);
  });

  it("存款：只收數字，手機跳數字鍵盤；說明寫在欄位下面", () => {
    const markup = render(createElement(UpdateBalanceButton, { account: { id: 1, name: "國泰", kind: "deposit", balance: 12000 } }));

    expect(inputOf(markup, "actual")).toContain('inputMode="numeric"');
    expect(describedHint(markup, "actual")).not.toBe("");
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
  const card = {
    id: 3,
    name: "國泰信用卡",
    kind: "credit" as const,
    openingBalance: -3500,
    openingCost: null,
    monthlyPlan: null,
    targetAmount: null,
    statementDay: 5,
    payFromAccountId: 2,
    autopay: true,
  };

  it("新增：先選類型（預設存款），存款有用途、起始餘額、每月規劃與目標；送到 createAccountAction", () => {
    const markup = render(createElement(AccountForm, { payFromAccounts, ...done }));

    expect(inputOf(markup, "kind")).toContain('value="deposit"');
    expect(fieldNames(markup)).toEqual(["kind", "label", "monthlyPlan", "name", "openingBalance", "targetAmount"]);
    expect(inputOf(markup, "name")).toContain("data-autofocus");
    expect(formActions()).toEqual([actions.createAccountAction]);
  });

  it("帳戶頁的「新增銀行帳戶」「新增信用卡」：類型已經決定，不再讓人選，送出的就是那一種", () => {
    const deposit = render(createElement(AccountForm, { kind: "deposit", payFromAccounts, ...done }));
    const credit = render(createElement(AccountForm, { kind: "credit", payFromAccounts, ...done }));

    expect(deposit).not.toContain('aria-label="帳戶類型"');
    expect(inputOf(deposit, "kind")).toMatch(/type="hidden"[^>]*value="deposit"/);
    expect(inputOf(credit, "kind")).toMatch(/type="hidden"[^>]*value="credit"/);
    expect(fieldNames(credit)).toEqual(["autopay", "cardStyle", "kind", "name", "openingBalance", "payFromAccountId", "statementDay"]);
  });

  it("用途是選填的文字（取代用途的下拉選單），修改時帶入原本的；信用卡沒有用途", () => {
    const markup = render(createElement(AccountForm, { account: { ...card, id: 1, kind: "deposit", label: "生活費", openingBalance: 52000, statementDay: null, payFromAccountId: null, autopay: false }, payFromAccounts, ...done }));

    expect(inputOf(markup, "label")).toContain('value="生活費"');
    expect(inputOf(markup, "label")).not.toContain("required");
    expect(selectOf(markup, "purposeId")).toBe("");
    expect(inputOf(render(createElement(AccountForm, { account: card, payFromAccounts, ...done })), "label")).toBe("");
  });

  it("信用卡的卡面顏色：六種顏色加「自動」（沒選時照建立的順序配色）；修改時選好原本的，沒選過的是自動", () => {
    const checked = (markup: string) => inputsOf(markup, "cardStyle").flatMap((input) => (input.includes("checked") ? [input.match(/value="([^"]*)"/)?.[1]] : []));
    const edit = render(createElement(AccountForm, { account: { ...card, cardStyle: "green" }, payFromAccounts, ...done }));

    expect(inputsOf(edit, "cardStyle")).toHaveLength(7);
    expect(checked(edit)).toEqual(["green"]);
    expect(checked(render(createElement(AccountForm, { kind: "credit", payFromAccounts, ...done })))).toEqual([""]);
  });

  it("隱私：只有自己取的名稱與金額，沒有帳號、卡號這類欄位（卡面顏色 cardStyle 不算），名稱的範例提醒不用填", () => {
    const deposit = render(createElement(AccountForm, { payFromAccounts, ...done }));
    const credit = render(createElement(AccountForm, { account: card, payFromAccounts, ...done }));

    expect([...fieldNames(deposit), ...fieldNames(credit)].join(" ")).not.toMatch(/number|card(?!Style)|holder|account(?!Id)/i);
    expect(inputOf(deposit, "name")).toContain("不用填帳號");
    expect(inputOf(credit, "name")).toContain("不用填卡號");
  });

  it("修改信用卡：類型不能改，未繳用正數帶入；結帳日、扣款帳戶（只列存款、不列停用的，原本選的停用了也留著）、自動扣繳與卡面顏色；沒有繳款截止日（填帳單時照帳單填）", () => {
    const markup = render(createElement(AccountForm, { account: card, payFromAccounts, ...done }));

    expect(markup).toMatch(/<input type="hidden" name="id" value="3"/);
    expect(inputOf(markup, "kind")).toBe("");
    expect(textOf(markup)).toContain("信用卡帳戶（類型建立後不能改）");
    expect(inputOf(markup, "openingBalance")).toContain('value="3500"');
    expect(textOf(markup)).not.toContain("繳款截止日");
    expect(selectedOption(selectOf(markup, "statementDay"))).toBe("5 日");
    expect(selectedOption(selectOf(markup, "payFromAccountId"))).toBe("郵局（已停用）");
    expect(textOf(selectOf(markup, "payFromAccountId"))).toBe("未設定國泰郵局（已停用）台新");
    expect(inputOf(markup, "autopay")).toMatch(/type="checkbox"[^>]*checked=""/);
    expect(fieldNames(markup)).toEqual(["autopay", "cardStyle", "id", "name", "openingBalance", "payFromAccountId", "statementDay"]);
    expect(formActions()).toEqual([actions.updateAccountAction]);
  });

  it("信用卡的結帳日可以不設；自動扣繳預設不勾", () => {
    const markup = render(createElement(AccountForm, { account: { ...card, statementDay: null, autopay: false }, payFromAccounts, ...done }));

    expect(selectedOption(selectOf(markup, "statementDay"))).toBe("未設定");
    expect(inputOf(markup, "autopay")).not.toContain("checked");
  });

  it("新增信用卡：目前未繳可以填負數（溢繳），不限定數字鍵盤（iPhone 的數字鍵盤沒有負號），說明寫在欄位下面", () => {
    const markup = render(createElement(AccountForm, { payFromAccounts, ...done }));
    const credit = render(createElement(AccountForm, { account: { ...card, openingBalance: 200 }, payFromAccounts, ...done }));

    expect(inputOf(markup, "openingBalance")).toContain('inputMode="numeric"');
    expect(inputOf(credit, "openingBalance")).not.toContain("inputMode");
    expect(describedHint(credit, "openingBalance")).toContain("多繳（溢繳）時填負數");
  });

  it("修改溢繳的信用卡（起始餘額是正的）：起始未繳帶入負數，不會變成 0", () => {
    const markup = render(createElement(AccountForm, { account: { ...card, openingBalance: 200 }, payFromAccounts, ...done }));

    expect(inputOf(markup, "openingBalance")).toContain('value="-200"');
  });

  it("修改投資帳戶：有市值與成本（成本留空當成跟市值一樣）", () => {
    const markup = render(createElement(AccountForm, { account: { ...card, id: 4, kind: "investment", openingBalance: 80000, openingCost: 60000, statementDay: null, payFromAccountId: null, autopay: false }, payFromAccounts, ...done }));

    expect(inputOf(markup, "openingBalance")).toContain('value="80000"');
    expect(inputOf(markup, "openingCost")).toContain('value="60000"');
    expect(textOf(markup)).toContain("起始市值（元）");
  });
});

describe("分類表單", () => {
  const colorOf = (markup: string) => markup.match(/<input type="hidden" name="color" value="(\w+)"/)?.[1];
  const FOOD = { id: 11, name: "餐飲", kind: "expense" as const, color: "orange" as const, monthlyBudget: 6000, icon: "utensils" };
  const iconRadios = (markup: string) => inputsOf(markup, "icon");

  it("不用選顏色（畫面上不再顯示）：新增時自動給還沒用過的顏色，資料表的顏色欄位才有值", () => {
    const markup = render(createElement(CategoryForm, { defaultKind: "expense", defaultColor: "amber", ...done }));

    expect(inputsOf(markup, "color")).toHaveLength(1);
    expect(colorOf(markup)).toBe("amber");
  });

  it("修改時原本的顏色原樣送回；以前存成灰色的（伺服器不收）換成還沒用過的，儲存才不會失敗", () => {
    expect(colorOf(render(createElement(CategoryForm, { category: { ...FOOD, color: "teal" }, defaultKind: "expense", defaultColor: "rose", ...done })))).toBe("teal");
    expect(colorOf(render(createElement(CategoryForm, { category: { id: 14, name: "提領現金", kind: "expense", color: "slate", monthlyBudget: null, icon: null }, defaultKind: "expense", defaultColor: "amber", ...done })))).toBe("amber");
  });

  it("圖示是一格一格的選擇器：每一格報讀器念得出中文名稱；修改時選好原本的圖示，送出 icon", () => {
    const radios = iconRadios(render(createElement(CategoryForm, { category: FOOD, defaultKind: "expense", defaultColor: "orange", ...done })));

    expect(radios.length).toBeGreaterThan(1);
    for (const radio of radios) expect(radio).toMatch(/type="radio"[^>]*aria-label="[一-鿿]+"/);
    expect(radios.filter((radio) => radio.includes('checked=""'))).toEqual([expect.stringContaining('value="utensils"')]);
  });

  it("沒有圖示的分類（或存了認不得的）_一格都不選，不送 icon，畫面用預設的圖示", () => {
    for (const icon of [null, "not-an-icon"]) {
      const markup = render(createElement(CategoryForm, { category: { ...FOOD, icon }, defaultKind: "expense", defaultColor: "orange", ...done }));

      expect(iconRadios(markup).some((radio) => radio.includes('checked=""'))).toBe(false);
    }
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

  it("修改分類：類型不能改，預算帶入", () => {
    const markup = render(createElement(CategoryForm, { category: { id: 11, name: "餐飲", kind: "expense", color: "orange", monthlyBudget: 6000, icon: null }, defaultKind: "expense", defaultColor: "orange", ...done }));

    expect(inputOf(markup, "kind")).toBe("");
    expect(inputOf(markup, "monthlyBudget")).toContain('value="6000"');
    expect(formActions()).toEqual([actions.updateCategoryAction]);
  });
});

describe("固定收支表單", () => {
  const HOLDINGS = [
    { id: 50, symbol: "006208", name: "富邦台灣50", accountId: 4, accountName: "臺銀證券", active: true },
    { id: 51, symbol: "0050", name: "元大台灣50", accountId: 4, accountName: "臺銀證券", active: true },
  ];
  const FORM = { ...OPTIONS, holdings: HOLDINGS, ...done };
  const ADD = { ...FORM, preset: "other" as const };
  const rule = {
    id: 30,
    kind: "expense" as const,
    name: "月票",
    accountId: 1,
    counterAccountId: null,
    categoryId: 12,
    amount: 1280,
    dayOfMonth: 20,
    intervalMonths: 1,
    startMonth: null,
    holidayRule: "after" as const,
    mode: "auto" as const,
    holdingId: null,
    allocate: false,
    note: "舊備註",
    active: true,
    lastPostedMonth: "2026-10-01",
    createdAt: "2026-09-01T02:00:00.000Z",
  };
  const typeOptions = (markup: string) => [...(markup.match(/<div role="group" aria-label="類型"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? "").matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map((m) => m[1]);
  const nextLine = (markup: string) => markup.match(/<p aria-live="polite"[^>]*>([^<]*)<\/p>/)?.[1];
  const optionsOf = (select: string) => [...select.matchAll(/<option[^>]*>([^<]*)<\/option>/g)].map((m) => m[1]);
  const hidden = (markup: string, name: string) => markup.match(new RegExp(`<input type="hidden" name="${name}" value="([^"]*)"`))?.[1];

  it("新增：預設支出；每月一次、日期預設今天、記帳方式預設「到期請我確認」", () => {
    const markup = render(createElement(RecurringForm, ADD));

    expect(hidden(markup, "kind")).toBe("expense");
    expect(selectedOption(selectOf(markup, "intervalMonths"))).toBe("每月");
    expect(selectedOption(selectOf(markup, "dayOfMonth"))).toBe("14 日");
    expect(selectedOption(selectOf(markup, "mode"))).toBe("到期請我確認");
    expect(fieldNames(markup)).toEqual(["accountId", "amount", "categoryId", "dayOfMonth", "holidayRule", "intervalMonths", "kind", "mode", "name"]);
    expect(formActions()).toEqual([actions.createRecurringAction]);
  });

  it("新增：下一期以伺服器給的台北今天為準，不看裝置的時鐘（裝置已經是隔天也一樣）", () => {
    vi.useFakeTimers({ now: new Date("2026-10-15T04:00:00Z"), toFake: ["Date"] });

    // 新的規則還沒有任何一期 寫第一期 不寫待處理
    expect(nextLine(render(createElement(RecurringForm, ADD)))).toBe("第一期 10/14");
  });

  it("下一期的那一行緊接在日期與遇假日下面，改了馬上念出新的日子（aria-live）", () => {
    const markup = render(createElement(RecurringForm, ADD));
    const order = [markup.indexOf('name="holidayRule"'), markup.indexOf('<p aria-live="polite"'), markup.indexOf('name="mode"')];

    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(order.every((index) => index >= 0)).toBe(true);
  });

  it("修改：帶入原本的名稱、金額、日期、遇假日與記帳方式；表單沒有備註欄位，原本的備註原樣送回", () => {
    const markup = render(createElement(RecurringForm, { ...FORM, rule }));

    expect(markup).toMatch(/<input type="hidden" name="id" value="30"/);
    expect(inputOf(markup, "name")).toContain('value="月票"');
    expect(inputOf(markup, "amount")).toContain('value="1280"');
    expect(selectedOption(selectOf(markup, "dayOfMonth"))).toBe("20 日");
    expect(selectedOption(selectOf(markup, "holidayRule"))).toBe("延後到下一個工作日");
    expect(selectedOption(selectOf(markup, "mode"))).toBe("自動記帳");
    expect(hidden(markup, "note")).toBe("舊備註");
    expect(markup).not.toMatch(/<input(?![^>]*type="hidden")[^>]*name="note"/);
    // 10 月已經處理過 下一期是 11 月 20 日 週五照常上班
    expect(nextLine(markup)).toBe("下一期 11/20");
    expect(formActions()).toEqual([actions.updateRecurringAction]);
  });

  it("每月的沒有「從哪個月開始」；間隔不是每月才問，選項從這個月起一年，原本的月份在範圍外也列出來", () => {
    expect(selectOf(render(createElement(RecurringForm, { ...FORM, rule })), "startMonth")).toBe("");

    const markup = render(createElement(RecurringForm, { ...FORM, rule: { ...rule, intervalMonths: 2, startMonth: "2026-09-01", lastPostedMonth: "2026-09-01" } }));
    const months = optionsOf(selectOf(markup, "startMonth"));

    expect(selectedOption(selectOf(markup, "intervalMonths"))).toBe("每 2 個月");
    expect(selectedOption(selectOf(markup, "startMonth"))).toBe("2026 年 9 月");
    expect(months).toHaveLength(13);
    expect([months[1], months.at(-1)]).toEqual(["2026 年 10 月", "2027 年 9 月"]);
    // 9 月處理過 每 2 個月一期 下一期在 11 月
    expect(nextLine(markup)).toBe("下一期 11/20");
  });

  // 人事總處 2026 年辦公日曆表 10 月 10 日是週六 10 月 9 日週五放假 10 月 12 日週一上班
  it.each([
    ["none", "下一期 10/10"],
    ["before", "下一期 10/8，10/10 遇假日提前"],
    ["after", "下一期 10/12，10/10 遇假日延後"],
  ] as const)("遇假日 %s：下一期照辦公日曆調整，寫出原本的日子", (holidayRule, expected) => {
    const markup = render(createElement(RecurringForm, { ...FORM, today: "2026-10-01", rule: { ...rule, dayOfMonth: 10, holidayRule, lastPostedMonth: "2026-09-01" } }));

    expect(nextLine(markup)).toBe(expected);
  });

  it("定期定額：扣款帳戶只列存款帳戶、哪一檔從持股選，轉入是那一檔所在的投資帳戶；記帳方式只能「到期請我確認」", () => {
    const markup = render(createElement(RecurringForm, { ...FORM, rule: { ...rule, kind: "transfer", name: null, accountId: 2, counterAccountId: 4, categoryId: null, holdingId: 51, mode: "confirm", amount: 3000 } }));

    expect(hidden(markup, "kind")).toBe("transfer");
    expect(optionsOf(selectOf(markup, "accountId"))).toEqual(["國泰", "郵局"]);
    expect(selectedOption(selectOf(markup, "accountId"))).toBe("郵局");
    expect(selectedOption(selectOf(markup, "holdingId"))).toBe("0050 元大台灣50");
    expect(hidden(markup, "counterAccountId")).toBe("4");
    expect(inputsOf(markup, "categoryId")).toEqual([]);
    expect(markup).toMatch(/<select[^>]*disabled=""[^>]*>[\s\S]*?<option value="confirm" selected="">到期請我確認/);
    expect(textOf(markup)).toContain("定期定額要確認股數");
    expect(hidden(markup, "mode")).toBe("confirm");
    expect(textOf(markup)).toContain("約定金額（元）");
  });

  it("修改薪水：還是薪水（不用選類型、照樣送出薪水），記帳方式只能「到期請我確認」；支出沒有薪水", () => {
    const salary = render(createElement(RecurringForm, { ...FORM, rule: { ...rule, kind: "income", name: "薪水", categoryId: 21, allocate: true, mode: "confirm", holidayRule: "before" } }));

    expect(typeOptions(salary)).toEqual([]);
    expect(hidden(salary, "kind")).toBe("income");
    expect(hidden(salary, "allocate")).toBe("on");
    expect(hidden(salary, "mode")).toBe("confirm");
    expect(selectOf(salary, "mode")).toBe("");
    expect(inputOf(render(createElement(RecurringForm, { ...FORM, rule })), "allocate")).toBe("");
  });

  describe("每月固定頁的三區各自新增（?add=salary|regular-buy|other）", () => {
    it("薪水：不用選類型；收入、先選好薪水分類；遇假日提前（勞動部：發薪日遇假日可以提前，不能延後）；記帳方式只能確認", () => {
      const markup = render(createElement(RecurringForm, { ...FORM, preset: "salary" }));

      expect(typeOptions(markup)).toEqual([]);
      expect(hidden(markup, "kind")).toBe("income");
      expect(hidden(markup, "allocate")).toBe("on");
      expect(inputsOf(markup, "categoryId").find((radio) => radio.includes('checked=""'))).toContain('value="21"');
      expect(selectedOption(selectOf(markup, "holidayRule"))).toBe("提前到前一個工作日");
      expect(hidden(markup, "mode")).toBe("confirm");
    });

    it("薪水的入帳帳戶不列信用卡（伺服器不收）", () => {
      expect(optionsOf(selectOf(render(createElement(RecurringForm, { ...FORM, preset: "salary" })), "accountId"))).toEqual(["國泰", "郵局"]);
    });

    it("定期定額：不用選類型；扣款帳戶與哪一檔；遇假日延後（扣款日遇假日順延到下一個交易日）", () => {
      const markup = render(createElement(RecurringForm, { ...FORM, preset: "regular-buy" }));

      expect(typeOptions(markup)).toEqual([]);
      expect(hidden(markup, "kind")).toBe("transfer");
      expect(selectOf(markup, "holdingId")).not.toBe("");
      expect(selectedOption(selectOf(markup, "holdingId"))).toBe("006208 富邦台灣50");
      expect(selectedOption(selectOf(markup, "holidayRule"))).toBe("延後到下一個工作日");
    });

    it("其他：支出、收入、轉帳（薪水與定期定額在自己那一區），收入沒有「這是薪水」", () => {
      expect(typeOptions(render(createElement(RecurringForm, { ...FORM, preset: "other" })))).toEqual(["支出", "收入", "轉帳"]);
      expect(inputOf(render(createElement(RecurringForm, { ...FORM, rule: { ...rule, kind: "income", categoryId: 21 } })), "allocate")).toBe("");
    });

    it("還沒有持股時選定期定額_說明先到投資頁新增那一檔，送出鈕停用", () => {
      const markup = render(createElement(RecurringForm, { ...FORM, holdings: [], preset: "regular-buy" }));

      expect(markup).toMatch(/<a [^>]*href="\/savings\/investments"/);
      expect(markup).toMatch(/<button disabled=""[^>]*class="btn-primary"/);
    });
  });

  it("要確認的規則到期了還沒處理：那一期在總覽的待處理，寫「待處理」不寫成下一期", () => {
    const markup = render(createElement(RecurringForm, { ...FORM, rule: { ...rule, dayOfMonth: 5, holidayRule: "none", mode: "confirm", lastPostedMonth: "2026-09-01" } }));

    expect(nextLine(markup)).toBe("待確認 10/5");
  });

  it("停用的不寫下一期", () => {
    expect(nextLine(render(createElement(RecurringForm, { ...FORM, rule: { ...rule, active: false } })))).toBe("已停用：恢復後才會記帳");
  });
});

describe("視窗裡的表單不用 <form action>", () => {
  it("給 <form> 的是 onSubmit（React 的 <form action> 送完一定清空欄位，失敗時打的字會不見）", () => {
    const forms = [
      render(createElement(EntryForm, { ...OPTIONS, action: actions.addTransactionAction, ...done })),
      render(createElement(UpdateBalanceButton, { account: { id: 1, name: "國泰", kind: "deposit", balance: 0 } })),
      render(createElement(AccountForm, { payFromAccounts: [], ...done })),
      render(createElement(CategoryForm, { defaultKind: "expense", defaultColor: "blue", ...done })),
      render(createElement(RecurringForm, { ...OPTIONS, holdings: [], preset: "other", ...done })),
      render(createElement(TradeForm, { record: { id: 80, accountId: 1, counterAccountId: 4, amount: 1000, date: TODAY, note: null }, accounts: [], today: TODAY, ...done })),
    ];

    for (const markup of forms) expect(markup).toMatch(/<form(?![^>]*action=)[^>]*>/);
  });
});
