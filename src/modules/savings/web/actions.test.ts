import { refresh, updateTag } from "next/cache";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { INVALID_FORM_MESSAGE } from "@/core/form";
import { OTHER_SESSION, TEST_SESSION, requireSession } from "@/dev/session-stub";
import { captureErrorLog, form, mocksOf } from "@/dev/test-helpers";

vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("../service/accounts", { spy: true });
vi.mock("../service/purposes", { spy: true });
vi.mock("../service/categories", { spy: true });
vi.mock("../service/setup", { spy: true });
vi.mock("../service/transactions", { spy: true });
vi.mock("../service/recurring", { spy: true });
vi.mock("../service/holdings", { spy: true });
vi.mock("../service/cards", { spy: true });

const { SavingsUserError } = await import("../service/errors");
const accounts = mocksOf(await import("../service/accounts"), "listAccounts", "createAccount", "updateAccount", "setAccountActive", "moveAccount", "deleteAccount");
const purposes = mocksOf(await import("../service/purposes"), "createPurpose", "updatePurpose", "movePurpose", "deletePurpose");
const categories = mocksOf(await import("../service/categories"), "listCategories", "createCategory", "updateCategory", "moveCategory", "deleteCategory");
const setup = mocksOf(await import("../service/setup"), "setupDefaults");
const transactions = mocksOf(await import("../service/transactions"), "addTransaction", "updateTransaction", "deleteTransaction", "updateBalance", "allocateSalary");
const recurring = mocksOf(await import("../service/recurring"), "createRecurring", "updateRecurring", "setRecurringActive", "deleteRecurring", "confirmOccurrence", "skipOccurrence");
const holdings = mocksOf(await import("../service/holdings"), "listHoldings", "addHolding", "updateHolding", "deleteHolding", "buyHolding", "sellHolding");
const cards = mocksOf(await import("../service/cards"), "payCard", "enterCardBill");
const services = [accounts, purposes, categories, setup, transactions, recurring, holdings, cards];
const allMocks = () => services.flatMap((service) => Object.values(service));
const actions = await import("./actions");

const NOW = new Date("2026-10-14T04:00:00Z");
const account = (id: number, name: string, kind = "deposit") => ({
  id,
  userId: TEST_SESSION.id,
  name,
  kind,
  purposeId: null,
  openingBalance: 0,
  openingCost: null,
  monthlyPlan: null,
  targetAmount: null,
  dueDay: null,
  payFromAccountId: null,
  active: true,
  sortOrder: id,
  createdAt: NOW,
});
const category = (id: number, name: string, kind: "expense" | "income") => ({ id, userId: TEST_SESSION.id, kind, name, color: "orange", monthlyBudget: null, sortOrder: id, createdAt: NOW });
const tx = (fields: Record<string, unknown>) => ({
  id: 70,
  userId: TEST_SESSION.id,
  kind: "expense",
  accountId: 1,
  counterAccountId: null,
  categoryId: 11,
  amount: 120,
  date: "2026-10-14",
  note: null,
  recurringId: null,
  createdAt: NOW,
  holdingId: null,
  shares: null,
  costChange: null,
  recurringPeriod: null,
  ...fields,
});
const rule = (fields: Record<string, unknown>) => ({
  id: 30,
  userId: TEST_SESSION.id,
  kind: "expense",
  accountId: 1,
  counterAccountId: null,
  categoryId: 13,
  amount: 15000,
  dayOfMonth: 6,
  note: null,
  active: true,
  lastPostedMonth: null,
  createdAt: NOW,
  name: null,
  intervalMonths: 1,
  startMonth: null,
  holidayRule: "none",
  mode: "auto",
  holdingId: null,
  allocate: false,
  lastNotifiedOn: null,
  ...fields,
});
const holding = (fields: Record<string, unknown> = {}) => ({ id: 21, userId: TEST_SESSION.id, accountId: 4, symbol: "006208", name: "富邦台50", shares: 31, cost: 7916, sortOrder: 0, createdAt: NOW, ...fields });

const CATHAY = account(1, "國泰");
const ACCOUNTS = [CATHAY, account(2, "郵局"), account(3, "國泰信用卡", "credit"), account(4, "元大證券", "investment")];
const CATEGORIES = [category(11, "餐飲", "expense"), category(12, "薪水", "income"), category(13, "房租", "expense")];

const ACCOUNT_FIELDS = {
  name: "國泰",
  kind: "deposit",
  purposeId: "5",
  openingBalance: "12,000",
  openingCost: "",
  monthlyPlan: "5000",
  targetAmount: "100000",
  dueDay: "",
  payFromAccountId: "",
  statementDay: "",
  autopay: "",
};
const ENTRY_FIELDS = { kind: "expense", accountId: "1", counterAccountId: "", categoryId: "11", amount: "120", date: "2026-10-14", note: "午餐" };
const RULE_FIELDS = {
  kind: "expense",
  accountId: "1",
  counterAccountId: "",
  categoryId: "13",
  amount: "15000",
  dayOfMonth: "6",
  note: "",
  name: "房租",
  intervalMonths: "1",
  startMonth: "",
  holidayRule: "none",
  mode: "confirm",
  holdingId: "",
  allocate: "",
};
const HOLDING_FIELDS = { accountId: "4", symbol: "006208", shares: "12", cost: "3,000" };
const BUY_FIELDS = { holdingId: "21", fromAccountId: "1", shares: "19", amount: "4,916", date: "2026-10-05", note: "" };
const SELL_FIELDS = { holdingId: "21", toAccountId: "1", shares: "5", amount: "1,300", date: "2026-10-14", note: "" };
const CONFIRM_FIELDS = { ruleId: "30", period: "2026-10", amount: "15,000", date: "2026-10-06", note: "", shares: "" };
const PAY_CARD_FIELDS = { cardId: "3", fromAccountId: "1", amount: "12,480", date: "2026-10-14", billAmount: "", categoryId: "" };
const CARD_BILL_FIELDS = { cardId: "3", amount: "12,480", statementDate: "", categoryId: "" };
const BILL = { id: 40, userId: TEST_SESSION.id, accountId: 3, statementDate: "2026-10-05", dueDate: "2026-10-20", amount: 12_480, createdAt: NOW };

/** 發薪分配的轉出是同一個名稱重複出現的成對欄位 form 只能放一個值 */
function salaryForm(fields: Record<string, string>, lines: [string, string][]): FormData {
  const data = form(fields);
  for (const [accountId, amount] of lines) {
    data.append("transferAccountId", accountId);
    data.append("transferAmount", amount);
  }
  return data;
}
const SALARY_FIELDS = { accountId: "1", categoryId: "12", amount: "43,000", date: "2026-10-05", note: "", ruleId: "", period: "" };
const SALARY_RESULT = {
  income: tx({ id: 80, kind: "income", categoryId: 12, amount: 43000 }),
  transfers: [tx({ id: 81, kind: "transfer", counterAccountId: 2, categoryId: null, amount: 5000 }), tx({ id: 82, kind: "transfer", counterAccountId: 4, categoryId: null, amount: 3000 }), tx({ id: 83, kind: "transfer", counterAccountId: 2, categoryId: null, amount: 3000 })],
  remainder: 32000,
};

beforeEach(() => {
  requireSession.mockReset();
  for (const fn of allMocks()) fn.mockReset();
  accounts.listAccounts.mockResolvedValue(ACCOUNTS);
  accounts.createAccount.mockResolvedValue(CATHAY);
  accounts.updateAccount.mockResolvedValue(CATHAY);
  accounts.setAccountActive.mockResolvedValue(undefined);
  accounts.moveAccount.mockResolvedValue(undefined);
  accounts.deleteAccount.mockResolvedValue("國泰");
  purposes.createPurpose.mockResolvedValue({ id: 5, name: "生活費", color: "blue" });
  purposes.updatePurpose.mockResolvedValue({ id: 5, name: "生活費", color: "blue" });
  purposes.movePurpose.mockResolvedValue(undefined);
  purposes.deletePurpose.mockResolvedValue("生活費");
  categories.listCategories.mockResolvedValue(CATEGORIES);
  categories.createCategory.mockResolvedValue(CATEGORIES[0]);
  categories.updateCategory.mockResolvedValue(CATEGORIES[0]);
  categories.moveCategory.mockResolvedValue(undefined);
  categories.deleteCategory.mockResolvedValue("餐飲");
  setup.setupDefaults.mockResolvedValue({ purposes: 3, categories: 5 });
  transactions.addTransaction.mockResolvedValue(tx({}));
  transactions.updateTransaction.mockResolvedValue(tx({}));
  transactions.deleteTransaction.mockResolvedValue(true);
  transactions.updateBalance.mockResolvedValue({ account: CATHAY, delta: -350 });
  transactions.allocateSalary.mockResolvedValue(SALARY_RESULT);
  recurring.createRecurring.mockResolvedValue(rule({}));
  recurring.updateRecurring.mockResolvedValue(rule({}));
  recurring.setRecurringActive.mockResolvedValue(undefined);
  recurring.deleteRecurring.mockResolvedValue(true);
  recurring.confirmOccurrence.mockResolvedValue({ rule: rule({ mode: "confirm" }), transaction: tx({ categoryId: 13, amount: 15000, recurringId: 30, recurringPeriod: "2026-10-01" }) });
  recurring.skipOccurrence.mockResolvedValue(rule({ mode: "confirm" }));
  holdings.listHoldings.mockResolvedValue([holding()]);
  holdings.addHolding.mockResolvedValue(holding({ shares: 12, cost: 3000 }));
  holdings.updateHolding.mockResolvedValue(holding());
  holdings.deleteHolding.mockResolvedValue("006208 富邦台50");
  holdings.buyHolding.mockResolvedValue({ holding: holding(), transaction: tx({ kind: "transfer", counterAccountId: 4, categoryId: null, amount: 4916, holdingId: 21, shares: 19, costChange: 4916 }) });
  holdings.sellHolding.mockResolvedValue({ holding: holding(), transaction: tx({ kind: "transfer", accountId: 4, counterAccountId: 1, categoryId: null, amount: 1300, holdingId: 21, shares: -5, costChange: -1250 }) });
  cards.payCard.mockResolvedValue({ transaction: tx({ kind: "transfer", counterAccountId: 3, categoryId: null, amount: 12480, note: "繳卡費" }), card: ACCOUNTS[2], from: CATHAY, bill: null, difference: 0 });
  cards.enterCardBill.mockResolvedValue({ bill: BILL, card: ACCOUNTS[2], difference: 9480 });
});

type Action = (prev: object, data: FormData) => Promise<{ error?: string; message?: string }>;

// 每個 Server Action 一列 最後一欄是要收到登入者 id 的 service
const CASES: [string, Action, () => FormData, Mock][] = [
  ["setupAction", actions.setupAction, () => form({}), setup.setupDefaults],
  ["createAccountAction", actions.createAccountAction, () => form(ACCOUNT_FIELDS), accounts.createAccount],
  ["updateAccountAction", actions.updateAccountAction, () => form({ id: "1", ...ACCOUNT_FIELDS }), accounts.updateAccount],
  ["setAccountActiveAction", actions.setAccountActiveAction, () => form({ id: "1", active: "false" }), accounts.setAccountActive],
  ["moveAccountAction", actions.moveAccountAction, () => form({ id: "1", direction: "up" }), accounts.moveAccount],
  ["deleteAccountAction", actions.deleteAccountAction, () => form({ id: "1" }), accounts.deleteAccount],
  ["createPurposeAction", actions.createPurposeAction, () => form({ name: "生活費", color: "blue" }), purposes.createPurpose],
  ["updatePurposeAction", actions.updatePurposeAction, () => form({ id: "5", name: "生活費", color: "blue" }), purposes.updatePurpose],
  ["movePurposeAction", actions.movePurposeAction, () => form({ id: "5", direction: "down" }), purposes.movePurpose],
  ["deletePurposeAction", actions.deletePurposeAction, () => form({ id: "5" }), purposes.deletePurpose],
  ["createCategoryAction", actions.createCategoryAction, () => form({ kind: "expense", name: "餐飲", color: "orange", monthlyBudget: "" }), categories.createCategory],
  ["updateCategoryAction", actions.updateCategoryAction, () => form({ id: "11", kind: "expense", name: "餐飲", color: "orange", monthlyBudget: "6000" }), categories.updateCategory],
  ["moveCategoryAction", actions.moveCategoryAction, () => form({ id: "11", direction: "up" }), categories.moveCategory],
  ["deleteCategoryAction", actions.deleteCategoryAction, () => form({ id: "11" }), categories.deleteCategory],
  ["addTransactionAction", actions.addTransactionAction, () => form(ENTRY_FIELDS), transactions.addTransaction],
  ["updateTransactionAction", actions.updateTransactionAction, () => form({ id: "70", ...ENTRY_FIELDS }), transactions.updateTransaction],
  ["deleteTransactionAction", actions.deleteTransactionAction, () => form({ id: "70" }), transactions.deleteTransaction],
  ["updateBalanceAction", actions.updateBalanceAction, () => form({ accountId: "1", actual: "11650" }), transactions.updateBalance],
  ["allocateSalaryAction", actions.allocateSalaryAction, () => salaryForm(SALARY_FIELDS, [["2", "5000"]]), transactions.allocateSalary],
  ["createRecurringAction", actions.createRecurringAction, () => form(RULE_FIELDS), recurring.createRecurring],
  ["updateRecurringAction", actions.updateRecurringAction, () => form({ id: "30", ...RULE_FIELDS }), recurring.updateRecurring],
  ["setRecurringActiveAction", actions.setRecurringActiveAction, () => form({ id: "30", active: "true" }), recurring.setRecurringActive],
  ["deleteRecurringAction", actions.deleteRecurringAction, () => form({ id: "30" }), recurring.deleteRecurring],
  ["confirmOccurrenceAction", actions.confirmOccurrenceAction, () => form(CONFIRM_FIELDS), recurring.confirmOccurrence],
  ["skipOccurrenceAction", actions.skipOccurrenceAction, () => form({ ruleId: "30", period: "2026-10" }), recurring.skipOccurrence],
  ["createHoldingAction", actions.createHoldingAction, () => form(HOLDING_FIELDS), holdings.addHolding],
  ["updateHoldingAction", actions.updateHoldingAction, () => form({ id: "21", shares: "31", cost: "7,916" }), holdings.updateHolding],
  ["deleteHoldingAction", actions.deleteHoldingAction, () => form({ id: "21" }), holdings.deleteHolding],
  ["buyHoldingAction", actions.buyHoldingAction, () => form(BUY_FIELDS), holdings.buyHolding],
  ["sellHoldingAction", actions.sellHoldingAction, () => form(SELL_FIELDS), holdings.sellHolding],
  ["payCardAction", actions.payCardAction, () => form(PAY_CARD_FIELDS), cards.payCard],
  ["enterCardBillAction", actions.enterCardBillAction, () => form(CARD_BILL_FIELDS), cards.enterCardBill],
];

describe("登入檢查", () => {
  it.each(CASES)("%s_沒登入_在動到資料前就被擋下", async (_name, action, data) => {
    requireSession.mockRejectedValue(new Error("NEXT_REDIRECT"));

    await expect(action({}, data())).rejects.toThrow("NEXT_REDIRECT");

    for (const fn of allMocks()) expect(fn).not.toHaveBeenCalled();
    expect(updateTag).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("擁有權：一律用登入者的 id 呼叫 service，表單送來的 id 只決定操作哪一筆", () => {
  it.each(CASES)("%s_帶的是登入者（bob）的 id", async (_name, action, data, service) => {
    requireSession.mockResolvedValue(OTHER_SESSION);

    await action({}, data());

    expect(service.mock.calls[0][0]).toBe(OTHER_SESSION.id);
  });

  it("查名稱組訊息時也只讀登入者自己的帳戶與分類", async () => {
    requireSession.mockResolvedValue(OTHER_SESSION);

    await actions.addTransactionAction({}, form(ENTRY_FIELDS));

    expect(accounts.listAccounts).toHaveBeenCalledWith(OTHER_SESSION.id);
    expect(categories.listCategories).toHaveBeenCalledWith(OTHER_SESSION.id);
  });

  it("確認待處理時查持股代號組訊息_也只讀登入者自己的", async () => {
    requireSession.mockResolvedValue(OTHER_SESSION);

    await actions.confirmOccurrenceAction({}, form(CONFIRM_FIELDS));

    expect(holdings.listHoldings).toHaveBeenCalledWith(OTHER_SESSION.id);
  });
});

describe("id 與旗標的檢查：Server Action 可以被直接 POST", () => {
  const withId: [string, Action, (id: string) => FormData][] = [
    ["updateAccountAction", actions.updateAccountAction, (id) => form({ id, ...ACCOUNT_FIELDS })],
    ["setAccountActiveAction", actions.setAccountActiveAction, (id) => form({ id, active: "true" })],
    ["moveAccountAction", actions.moveAccountAction, (id) => form({ id, direction: "up" })],
    ["deleteAccountAction", actions.deleteAccountAction, (id) => form({ id })],
    ["updatePurposeAction", actions.updatePurposeAction, (id) => form({ id, name: "x", color: "blue" })],
    ["movePurposeAction", actions.movePurposeAction, (id) => form({ id, direction: "up" })],
    ["deletePurposeAction", actions.deletePurposeAction, (id) => form({ id })],
    ["updateCategoryAction", actions.updateCategoryAction, (id) => form({ id, kind: "expense", name: "x", color: "blue", monthlyBudget: "" })],
    ["moveCategoryAction", actions.moveCategoryAction, (id) => form({ id, direction: "up" })],
    ["deleteCategoryAction", actions.deleteCategoryAction, (id) => form({ id })],
    ["updateTransactionAction", actions.updateTransactionAction, (id) => form({ id, ...ENTRY_FIELDS })],
    ["deleteTransactionAction", actions.deleteTransactionAction, (id) => form({ id })],
    ["updateRecurringAction", actions.updateRecurringAction, (id) => form({ id, ...RULE_FIELDS })],
    ["setRecurringActiveAction", actions.setRecurringActiveAction, (id) => form({ id, active: "true" })],
    ["deleteRecurringAction", actions.deleteRecurringAction, (id) => form({ id })],
    ["updateHoldingAction", actions.updateHoldingAction, (id) => form({ id, shares: "1", cost: "1" })],
    ["deleteHoldingAction", actions.deleteHoldingAction, (id) => form({ id })],
  ];

  it.each(withId)("%s_id 不是正整數（abc、0、-1、1.5、空白）_回「資料不正確」、不呼叫 service", async (_name, action, data) => {
    for (const id of ["abc", "0", "-1", "1.5", ""]) {
      expect(await action({}, data(id))).toEqual({ error: INVALID_FORM_MESSAGE });
    }

    for (const fn of allMocks()) expect(fn).not.toHaveBeenCalled();
    expect(updateTag).not.toHaveBeenCalled();
  });

  it.each(["yes", "", "TRUE", "1"])("停用開關 active=%j（不是 true／false）_回錯誤、不呼叫 service：奇怪的值不能當成停用", async (raw) => {
    expect(await actions.setAccountActiveAction({}, form({ id: "1", active: raw }))).toEqual({ error: INVALID_FORM_MESSAGE });
    expect(await actions.setRecurringActiveAction({}, form({ id: "30", active: raw }))).toEqual({ error: INVALID_FORM_MESSAGE });

    expect(accounts.setAccountActive).not.toHaveBeenCalled();
    expect(recurring.setRecurringActive).not.toHaveBeenCalled();
  });

  it.each([
    ["moveAccountAction", actions.moveAccountAction],
    ["movePurposeAction", actions.movePurposeAction],
    ["moveCategoryAction", actions.moveCategoryAction],
  ] as const)("%s_方向不是 up／down_回錯誤、不呼叫 service", async (_name, action) => {
    expect(await action({}, form({ id: "1", direction: "left" }))).toEqual({ error: INVALID_FORM_MESSAGE });

    for (const fn of allMocks()) expect(fn).not.toHaveBeenCalled();
  });
});

describe("帳戶", () => {
  it("新增_表單原樣交給 service 驗證（欄位名稱跟 service 一樣）_回傳成功訊息", async () => {
    const state = await actions.createAccountAction({}, form(ACCOUNT_FIELDS));

    expect(accounts.createAccount).toHaveBeenCalledWith(TEST_SESSION.id, ACCOUNT_FIELDS);
    expect(state).toEqual({ message: "已新增帳戶「國泰」" });
  });

  it("修改_帶 id 給 service_用存好的名稱回傳訊息", async () => {
    accounts.updateAccount.mockResolvedValue(account(1, "國泰世華"));

    const state = await actions.updateAccountAction({}, form({ id: "1", ...ACCOUNT_FIELDS, name: " 國泰世華 " }));

    expect(accounts.updateAccount).toHaveBeenCalledWith(TEST_SESSION.id, 1, { ...ACCOUNT_FIELDS, name: " 國泰世華 " });
    expect(state).toEqual({ message: "已儲存「國泰世華」" });
  });

  it("刪除_回傳刪掉的名稱", async () => {
    expect(await actions.deleteAccountAction({}, form({ id: "1" }))).toEqual({ message: "已刪除「國泰」" });
    expect(accounts.deleteAccount).toHaveBeenCalledWith(TEST_SESSION.id, 1);
  });
});

describe("記帳", () => {
  it("支出_表單原樣交給 service_訊息是「已記錄：分類 金額（帳戶）」", async () => {
    const state = await actions.addTransactionAction({}, form(ENTRY_FIELDS));

    expect(transactions.addTransaction).toHaveBeenCalledWith(TEST_SESSION.id, ENTRY_FIELDS);
    expect(state).toEqual({ message: "已記錄：餐飲 $120（國泰）" });
  });

  it("收入_金額帶 +", async () => {
    transactions.addTransaction.mockResolvedValue(tx({ kind: "income", categoryId: 12, amount: 43000 }));

    expect(await actions.addTransactionAction({}, form({ ...ENTRY_FIELDS, kind: "income", categoryId: "12" }))).toEqual({ message: "已記錄：薪水 +$43,000（國泰）" });
  });

  it("轉帳_訊息是「已轉帳：轉出 → 轉入 金額」", async () => {
    const fields = { ...ENTRY_FIELDS, kind: "transfer", counterAccountId: "2", categoryId: "", amount: "2,500" };
    transactions.addTransaction.mockResolvedValue(tx({ kind: "transfer", counterAccountId: 2, categoryId: null, amount: 2500 }));

    const state = await actions.addTransactionAction({}, form(fields));

    expect(transactions.addTransaction).toHaveBeenCalledWith(TEST_SESSION.id, fields);
    expect(state).toEqual({ message: "已轉帳：國泰 → 郵局 $2,500" });
  });

  it("訊息要用的名稱在寫入前就讀好：讀不到時還沒記帳，不會變成記好了卻說失敗", async () => {
    captureErrorLog();
    accounts.listAccounts.mockRejectedValue(new Error("connection reset"));

    const state = await actions.addTransactionAction({}, form(ENTRY_FIELDS));

    expect(state.error).toBe("記帳失敗（詳見伺服器 log）");
    expect(transactions.addTransaction).not.toHaveBeenCalled();
  });
});

describe("更新餘額", () => {
  it("帳戶與實際金額交給 service_有差額時寫出調整了多少", async () => {
    const state = await actions.updateBalanceAction({}, form({ accountId: "1", actual: "11,650" }));

    expect(transactions.updateBalance).toHaveBeenCalledWith(TEST_SESSION.id, { accountId: "1", actual: "11,650" });
    expect(state).toEqual({ message: "已更新「國泰」：調整 -$350" });
  });

  it("變多時帶 +", async () => {
    transactions.updateBalance.mockResolvedValue({ account: CATHAY, delta: 1200 });

    expect(await actions.updateBalanceAction({}, form({ accountId: "1", actual: "13200" }))).toEqual({ message: "已更新「國泰」：調整 +$1,200" });
  });

  it("跟記錄的一樣（差額 0）_沒有寫入，不失效快取", async () => {
    transactions.updateBalance.mockResolvedValue({ account: CATHAY, delta: 0 });

    expect(await actions.updateBalanceAction({}, form({ accountId: "1", actual: "12000" }))).toEqual({ message: "「國泰」的餘額沒有變" });
    expect(updateTag).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("發薪分配", () => {
  it("薪水與每一筆轉出（成對的欄位）交給 service_訊息寫出轉出幾筆、入帳帳戶留下多少", async () => {
    const state = await actions.allocateSalaryAction(
      {},
      salaryForm(SALARY_FIELDS, [
        ["2", "5,000"],
        ["4", "3000"],
        ["2", "3000"],
      ]),
    );

    expect(transactions.allocateSalary).toHaveBeenCalledWith(TEST_SESSION.id, {
      ...SALARY_FIELDS,
      transfers: [
        { accountId: "2", amount: "5,000" },
        { accountId: "4", amount: "3000" },
        { accountId: "2", amount: "3000" },
      ],
    });
    expect(state).toEqual({ message: "已入帳並分配薪水 $43,000，轉出 3 筆，「國泰」留下 $32,000" });
  });

  it("分配的金額留空_當成 0（不轉），不讓整張表單失敗", async () => {
    await actions.allocateSalaryAction(
      {},
      salaryForm(SALARY_FIELDS, [
        ["2", " "],
        ["4", "3000"],
      ]),
    );

    expect(transactions.allocateSalary.mock.calls[0][1].transfers).toEqual([
      { accountId: "2", amount: "0" },
      { accountId: "4", amount: "3000" },
    ]);
  });

  it("轉出的帳戶與金額數量對不上（表單被改過）_回錯誤、不呼叫 service", async () => {
    const data = salaryForm(SALARY_FIELDS, [["2", "5000"]]);
    data.append("transferAccountId", "4");

    expect(await actions.allocateSalaryAction({}, data)).toEqual({ error: INVALID_FORM_MESSAGE });
    expect(transactions.allocateSalary).not.toHaveBeenCalled();
  });
});

describe("持股、買賣、待處理與繳卡費：FormData 的欄位名稱照 SPEC，原樣交給 service 驗證", () => {
  it.each([
    ["createHoldingAction", () => actions.createHoldingAction({}, form(HOLDING_FIELDS)), () => holdings.addHolding, [HOLDING_FIELDS]],
    ["updateHoldingAction", () => actions.updateHoldingAction({}, form({ id: "21", shares: "31", cost: "7,916" })), () => holdings.updateHolding, [21, { shares: "31", cost: "7,916" }]],
    ["buyHoldingAction", () => actions.buyHoldingAction({}, form(BUY_FIELDS)), () => holdings.buyHolding, [BUY_FIELDS]],
    ["sellHoldingAction", () => actions.sellHoldingAction({}, form(SELL_FIELDS)), () => holdings.sellHolding, [SELL_FIELDS]],
    ["confirmOccurrenceAction", () => actions.confirmOccurrenceAction({}, form(CONFIRM_FIELDS)), () => recurring.confirmOccurrence, [CONFIRM_FIELDS]],
    ["skipOccurrenceAction", () => actions.skipOccurrenceAction({}, form({ ruleId: "30", period: "2026-10" })), () => recurring.skipOccurrence, [{ ruleId: "30", period: "2026-10" }]],
    ["payCardAction", () => actions.payCardAction({}, form(PAY_CARD_FIELDS)), () => cards.payCard, [PAY_CARD_FIELDS]],
    ["payCardAction（一起填帳單）", () => actions.payCardAction({}, form({ ...PAY_CARD_FIELDS, billAmount: "12,480" })), () => cards.payCard, [{ ...PAY_CARD_FIELDS, billAmount: "12,480" }]],
    ["enterCardBillAction", () => actions.enterCardBillAction({}, form({ ...CARD_BILL_FIELDS, statementDate: "2026-10-05", categoryId: "11" })), () => cards.enterCardBill, [{ ...CARD_BILL_FIELDS, statementDate: "2026-10-05", categoryId: "11" }]],
    ["createRecurringAction", () => actions.createRecurringAction({}, form(RULE_FIELDS)), () => recurring.createRecurring, [RULE_FIELDS]],
    ["createAccountAction", () => actions.createAccountAction({}, form({ ...ACCOUNT_FIELDS, kind: "credit", dueDay: "20", statementDay: "5", autopay: "on" })), () => accounts.createAccount, [{ ...ACCOUNT_FIELDS, kind: "credit", dueDay: "20", statementDay: "5", autopay: "on" }]],
  ] as const)("%s", async (_name, run, service, args) => {
    expect(await run()).not.toHaveProperty("error");

    expect(service()).toHaveBeenCalledWith(TEST_SESSION.id, ...args);
  });

  it("繳卡費的訊息跟按鈕一樣寫已繳，寫出繳了哪張卡多少錢（協調者定的寫法：已繳國泰卡 $12,480）", async () => {
    cards.payCard.mockResolvedValue({ transaction: tx({ kind: "transfer", counterAccountId: 3, categoryId: null, amount: 12480 }), card: account(3, "國泰卡", "credit"), from: CATHAY, bill: null, difference: 0 });

    expect(await actions.payCardAction({}, form(PAY_CARD_FIELDS))).toEqual({ message: "已繳國泰卡 $12,480" });
  });

  it("發薪分配從待處理確認_帶上 ruleId 與 period 給 service", async () => {
    await actions.allocateSalaryAction({}, salaryForm({ ...SALARY_FIELDS, ruleId: "30", period: "2026-10" }, [["2", "5000"]]));

    expect(transactions.allocateSalary.mock.calls[0][1]).toMatchObject({ ruleId: "30", period: "2026-10" });
  });
});

describe("錯誤處理", () => {
  it.each(CASES)("%s_使用者輸入錯誤（SavingsUserError）_原樣顯示訊息、不失效快取", async (_name, action, data, service) => {
    service.mockRejectedValue(new SavingsUserError("找不到這個帳戶，可能已經刪除了"));

    expect(await action({}, data())).toEqual({ error: "找不到這個帳戶，可能已經刪除了" });
    expect(updateTag).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("非預期錯誤_回傳摘要，log 只記錯誤種類不記 message（可能含 SQL 與參數）", async () => {
    const log = captureErrorLog();
    const error = new Error('Failed query: insert into "savings_transactions" params: secret-detail');
    error.name = "DrizzleQueryError";
    transactions.addTransaction.mockRejectedValue(error);

    const state = await actions.addTransactionAction({}, form(ENTRY_FIELDS));

    expect(state).toEqual({ error: "記帳失敗（詳見伺服器 log）" });
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret-detail");
    expect(JSON.stringify(log.mock.calls)).toContain("DrizzleQueryError");
    expect(updateTag).not.toHaveBeenCalled();
  });
});
