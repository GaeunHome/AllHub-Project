import { refresh, revalidateTag, updateTag } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { form, mocksOf, updated } from "@/dev/test-helpers";

vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("../service/accounts", { spy: true });
vi.mock("../service/categories", { spy: true });
vi.mock("../service/setup", { spy: true });
vi.mock("../service/transactions", { spy: true });
vi.mock("../service/recurring", { spy: true });
vi.mock("../service/holdings", { spy: true });
vi.mock("../service/cards", { spy: true });

const { SavingsUserError } = await import("../service/errors");
const accounts = mocksOf(await import("../service/accounts"), "listAccounts", "createAccount", "updateAccount", "setAccountActive", "moveAccount", "deleteAccount", "updateAllocation");
const categories = mocksOf(await import("../service/categories"), "listCategories", "createCategory", "updateCategory", "moveCategory", "deleteCategory");
const setup = mocksOf(await import("../service/setup"), "setupDefaults");
const transactions = mocksOf(await import("../service/transactions"), "addTransaction", "updateTransaction", "deleteTransaction", "updateBalance", "allocateSalary");
const recurring = mocksOf(await import("../service/recurring"), "createRecurring", "updateRecurring", "setRecurringActive", "deleteRecurring", "confirmOccurrence", "skipOccurrence");
const holdings = mocksOf(await import("../service/holdings"), "listHoldings", "addHolding", "updateHolding", "deleteHolding", "buyHolding", "sellHolding");
const cards = mocksOf(await import("../service/cards"), "payCard", "enterCardBill");
const actions = await import("./actions");

const CATHAY = { id: 1, name: "國泰", kind: "deposit" };
const EXPENSE = { id: 70, kind: "expense", accountId: 1, counterAccountId: null, categoryId: null, amount: 120, date: "2026-10-14" };
const RULE = { id: 30, kind: "expense", accountId: 1, counterAccountId: null, categoryId: null, amount: 15000, dayOfMonth: 6, name: null, intervalMonths: 1, startMonth: null, holidayRule: "none", mode: "confirm", holdingId: null, note: null };
const HOLDING = { id: 21, accountId: 4, symbol: "006208", name: "富邦台50", shares: 31, cost: 7916 };
const TRADE = { ...EXPENSE, kind: "transfer", counterAccountId: 4, amount: 4916, holdingId: 21, shares: 19 };
const ENTRY = { kind: "expense", accountId: "1", counterAccountId: "", categoryId: "", amount: "120", date: "2026-10-14", note: "" };
const BILL = { id: 40, accountId: 3, statementDate: "2026-10-05", dueDate: "2026-10-20", amount: 12_480 };
const RULE_FIELDS = { kind: "expense", accountId: "1", counterAccountId: "", categoryId: "", amount: "15000", dayOfMonth: "6", note: "" };

beforeEach(() => {
  for (const service of [accounts, categories, setup, transactions, recurring, holdings, cards]) {
    for (const fn of Object.values(service)) fn.mockReset().mockResolvedValue(undefined);
  }
  accounts.listAccounts.mockResolvedValue([CATHAY]);
  accounts.createAccount.mockResolvedValue(CATHAY);
  accounts.updateAccount.mockResolvedValue(CATHAY);
  accounts.deleteAccount.mockResolvedValue("國泰");
  accounts.updateAllocation.mockResolvedValue(2);
  categories.listCategories.mockResolvedValue([]);
  categories.createCategory.mockResolvedValue({ id: 11, name: "餐飲" });
  categories.updateCategory.mockResolvedValue({ id: 11, name: "餐飲" });
  categories.deleteCategory.mockResolvedValue("餐飲");
  setup.setupDefaults.mockResolvedValue({ categories: 5 });
  transactions.addTransaction.mockResolvedValue(EXPENSE);
  transactions.updateTransaction.mockResolvedValue(EXPENSE);
  transactions.deleteTransaction.mockResolvedValue(true);
  transactions.updateBalance.mockResolvedValue({ account: CATHAY, delta: -350 });
  transactions.allocateSalary.mockResolvedValue({ income: { ...EXPENSE, kind: "income", amount: 43000 }, transfers: [], remainder: 43000 });
  recurring.createRecurring.mockResolvedValue(RULE);
  recurring.updateRecurring.mockResolvedValue(RULE);
  recurring.deleteRecurring.mockResolvedValue(true);
  recurring.confirmOccurrence.mockResolvedValue({ rule: RULE, transaction: { ...EXPENSE, holdingId: null } });
  recurring.skipOccurrence.mockResolvedValue(RULE);
  holdings.listHoldings.mockResolvedValue([HOLDING]);
  holdings.addHolding.mockResolvedValue(HOLDING);
  holdings.updateHolding.mockResolvedValue(HOLDING);
  holdings.deleteHolding.mockResolvedValue("006208 富邦台50");
  holdings.buyHolding.mockResolvedValue({ holding: HOLDING, transaction: TRADE });
  holdings.sellHolding.mockResolvedValue({ holding: HOLDING, transaction: { ...TRADE, shares: -5 } });
  cards.payCard.mockResolvedValue({ transaction: { ...EXPENSE, kind: "transfer", counterAccountId: 3 }, card: { id: 3, name: "國泰卡" }, from: CATHAY, bill: null, difference: 0 });
  cards.enterCardBill.mockResolvedValue({ bill: BILL, card: { id: 3, name: "國泰卡" }, difference: 9480 });
});

describe("理財的 Server Action：寫入成功後用 updateTag 讓改到的表失效", () => {
  it.each([
    // 開始使用只建分類
    ["setupAction", ["savings:categories"], () => actions.setupAction()],
    ["createAccountAction", ["savings:accounts"], () => actions.createAccountAction({}, form({ name: "國泰", kind: "deposit" }))],
    // 改名也算 明細的帳戶名稱是讀取時 join 的 月份明細的快取也標了 accounts
    ["updateAccountAction", ["savings:accounts"], () => actions.updateAccountAction({}, form({ id: "1", name: "國泰世華" }))],
    ["setAccountActiveAction", ["savings:accounts"], () => actions.setAccountActiveAction({}, form({ id: "1", active: "false" }))],
    ["moveAccountAction", ["savings:accounts"], () => actions.moveAccountAction({}, form({ id: "1", direction: "up" }))],
    // 每月規劃與目標存在帳戶上
    ["updateAllocationAction", ["savings:accounts"], () => actions.updateAllocationAction({}, form({ accountId: "1", "monthlyPlan:1": "5000", "targetAmount:1": "" }))],
    // 帳戶的紀錄 含轉帳的另一邊 固定收支 持股與帳單跟著刪除
    ["deleteAccountAction", ["savings:accounts", "savings:bills", "savings:holdings", "savings:recurring", "savings:transactions"], () => actions.deleteAccountAction({}, form({ id: "1" }))],
    // 用了這個用途的帳戶改成未設定
    ["createCategoryAction", ["savings:categories"], () => actions.createCategoryAction({}, form({ kind: "expense", name: "餐飲" }))],
    ["updateCategoryAction", ["savings:categories"], () => actions.updateCategoryAction({}, form({ id: "11", name: "外食" }))],
    ["moveCategoryAction", ["savings:categories"], () => actions.moveCategoryAction({}, form({ id: "11", direction: "up" }))],
    // 紀錄與固定收支改成未分類
    ["deleteCategoryAction", ["savings:categories", "savings:recurring", "savings:transactions"], () => actions.deleteCategoryAction({}, form({ id: "11" }))],
    ["addTransactionAction", ["savings:transactions"], () => actions.addTransactionAction({}, form(ENTRY))],
    ["updateTransactionAction", ["savings:transactions"], () => actions.updateTransactionAction({}, form({ id: "70", ...ENTRY }))],
    // 買賣紀錄會還原持股 確認來的紀錄會把游標退回去 帳單補的那一筆連帳單一起刪
    ["deleteTransactionAction", ["savings:bills", "savings:holdings", "savings:recurring", "savings:transactions"], () => actions.deleteTransactionAction({}, form({ id: "70" }))],
    ["updateBalanceAction", ["savings:transactions"], () => actions.updateBalanceAction({}, form({ accountId: "1", actual: "11650" }))],
    // 薪水與每一筆轉出都是紀錄 同一個交易寫入
    ["allocateSalaryAction", ["savings:transactions"], () => actions.allocateSalaryAction({}, form({ accountId: "1", amount: "43000", date: "2026-10-05" }))],
    // 從待處理確認薪水那一期 游標也推了
    ["allocateSalaryAction（待處理的入帳並分配）", ["savings:recurring", "savings:transactions"], () => actions.allocateSalaryAction({}, form({ accountId: "1", amount: "43000", date: "2026-10-05", ruleId: "30", period: "2026-10" }))],
    ["createRecurringAction", ["savings:recurring"], () => actions.createRecurringAction({}, form(RULE_FIELDS))],
    ["updateRecurringAction", ["savings:recurring"], () => actions.updateRecurringAction({}, form({ id: "30", ...RULE_FIELDS }))],
    ["setRecurringActiveAction", ["savings:recurring"], () => actions.setRecurringActiveAction({}, form({ id: "30", active: "false" }))],
    // 自動記好的紀錄留著 但 recurring_id 改成 null
    // 紀錄上的自動標籤跟著不見 明細也要重讀
    ["deleteRecurringAction", ["savings:recurring", "savings:transactions"], () => actions.deleteRecurringAction({}, form({ id: "30" }))],
    ["createHoldingAction", ["savings:holdings"], () => actions.createHoldingAction({}, form({ accountId: "4", symbol: "006208", shares: "12", cost: "3000" }))],
    ["updateHoldingAction", ["savings:holdings"], () => actions.updateHoldingAction({}, form({ id: "21", shares: "31", cost: "7916" }))],
    // 定期定額跟著刪 買賣紀錄的代號是讀取時 join 的
    ["deleteHoldingAction", ["savings:holdings", "savings:recurring", "savings:transactions"], () => actions.deleteHoldingAction({}, form({ id: "21" }))],
    ["buyHoldingAction", ["savings:holdings", "savings:transactions"], () => actions.buyHoldingAction({}, form({ holdingId: "21", fromAccountId: "1", shares: "19", amount: "4916", date: "2026-10-05" }))],
    ["sellHoldingAction", ["savings:holdings", "savings:transactions"], () => actions.sellHoldingAction({}, form({ holdingId: "21", toAccountId: "1", shares: "5", amount: "1300", date: "2026-10-14" }))],
    ["confirmOccurrenceAction", ["savings:recurring", "savings:transactions"], () => actions.confirmOccurrenceAction({}, form({ ruleId: "30", period: "2026-10", amount: "15000", date: "2026-10-06" }))],
    ["skipOccurrenceAction", ["savings:recurring"], () => actions.skipOccurrenceAction({}, form({ ruleId: "30", period: "2026-10" }))],
    ["payCardAction", ["savings:transactions"], () => actions.payCardAction({}, form({ cardId: "3", fromAccountId: "1", amount: "12480", date: "2026-10-14" }))],
    // 帳單與補的那一筆紀錄
    ["enterCardBillAction", ["savings:bills", "savings:transactions"], () => actions.enterCardBillAction({}, form({ cardId: "3", amount: "12480" }))],
  ] as const)("%s_%j", async (_name, tags, run) => {
    expect(await run()).not.toHaveProperty("error");

    expect(updated()).toEqual([...tags].sort());
    expect(revalidateTag).not.toHaveBeenCalled();
    // updateTag 已經讓這次回應帶著重新算繪的頁面 再 refresh 是多餘的
    expect(refresh).not.toHaveBeenCalled();
  });

  it.each([
    ["deleteAccountAction", () => accounts.deleteAccount.mockResolvedValue(null), () => actions.deleteAccountAction({}, form({ id: "1" }))],
    ["deleteCategoryAction", () => categories.deleteCategory.mockResolvedValue(null), () => actions.deleteCategoryAction({}, form({ id: "11" }))],
    ["deleteTransactionAction", () => transactions.deleteTransaction.mockResolvedValue(false), () => actions.deleteTransactionAction({}, form({ id: "70" }))],
    ["deleteRecurringAction", () => recurring.deleteRecurring.mockResolvedValue(false), () => actions.deleteRecurringAction({}, form({ id: "30" }))],
  ] as const)("%s_要刪的已經不在了_沒有寫入就不失效，改用 refresh 讓畫面拿掉那一列", async (_name, gone, run) => {
    gone();

    await run();

    expect(updateTag).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("繳卡費時一起填了帳單_帳單也失效", async () => {
    cards.payCard.mockResolvedValue({ transaction: { ...EXPENSE, kind: "transfer", counterAccountId: 3 }, card: { id: 3, name: "國泰卡" }, from: CATHAY, bill: BILL, difference: 9480 });

    await actions.payCardAction({}, form({ cardId: "3", fromAccountId: "1", amount: "12480", date: "2026-10-14", billAmount: "12480" }));

    expect(updated()).toEqual(["savings:bills", "savings:transactions"]);
  });

  it("確認定期定額（走買進）_持股也失效", async () => {
    recurring.confirmOccurrence.mockResolvedValue({ rule: { ...RULE, kind: "transfer", holdingId: 21 }, transaction: TRADE });

    await actions.confirmOccurrenceAction({}, form({ ruleId: "30", period: "2026-10", amount: "4916", date: "2026-10-05", shares: "19" }));

    expect(updated()).toEqual(["savings:holdings", "savings:recurring", "savings:transactions"]);
  });

  it("要刪的持股已經不在了_不失效，改用 refresh 讓畫面拿掉那一列", async () => {
    holdings.deleteHolding.mockResolvedValue(null);

    await actions.deleteHoldingAction({}, form({ id: "21" }));

    expect(updateTag).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("更新餘額時跟記錄的一樣（差額 0）_沒有寫入，不失效也不重繪", async () => {
    transactions.updateBalance.mockResolvedValue({ account: CATHAY, delta: 0 });

    await actions.updateBalanceAction({}, form({ accountId: "1", actual: "12000" }));

    expect(updateTag).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("開始使用時分類已經有了（什麼都沒建）_不失效，改用 refresh 讓還停在舊畫面的分頁換掉「開始使用」", async () => {
    setup.setupDefaults.mockResolvedValue({ categories: 0 });

    await actions.setupAction();

    expect(updateTag).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("輸入有誤（SavingsUserError）_沒有寫入就不失效", async () => {
    transactions.addTransaction.mockRejectedValue(new SavingsUserError("金額至少 1 元"));

    expect(await actions.addTransactionAction({}, form({ ...ENTRY, amount: "0" }))).toEqual({ error: "金額至少 1 元" });
    expect(updateTag).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });
});
