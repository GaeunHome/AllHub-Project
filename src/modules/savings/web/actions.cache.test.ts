import { refresh, revalidateTag, updateTag } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { form, mocksOf, updated } from "@/dev/test-helpers";

vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("../service/accounts", { spy: true });
vi.mock("../service/purposes", { spy: true });
vi.mock("../service/categories", { spy: true });
vi.mock("../service/setup", { spy: true });
vi.mock("../service/transactions", { spy: true });
vi.mock("../service/recurring", { spy: true });

const { SavingsUserError } = await import("../service/errors");
const accounts = mocksOf(await import("../service/accounts"), "listAccounts", "createAccount", "updateAccount", "setAccountActive", "moveAccount", "deleteAccount");
const purposes = mocksOf(await import("../service/purposes"), "createPurpose", "updatePurpose", "movePurpose", "deletePurpose");
const categories = mocksOf(await import("../service/categories"), "listCategories", "createCategory", "updateCategory", "moveCategory", "deleteCategory");
const setup = mocksOf(await import("../service/setup"), "setupDefaults");
const transactions = mocksOf(await import("../service/transactions"), "addTransaction", "updateTransaction", "deleteTransaction", "updateBalance", "allocateSalary");
const recurring = mocksOf(await import("../service/recurring"), "createRecurring", "updateRecurring", "setRecurringActive", "deleteRecurring");
const actions = await import("./actions");

const CATHAY = { id: 1, name: "國泰", kind: "deposit" };
const EXPENSE = { id: 70, kind: "expense", accountId: 1, counterAccountId: null, categoryId: null, amount: 120, date: "2026-10-14" };
const RULE = { id: 30, kind: "expense", accountId: 1, counterAccountId: null, categoryId: null, amount: 15000, dayOfMonth: 6 };
const ENTRY = { kind: "expense", accountId: "1", counterAccountId: "", categoryId: "", amount: "120", date: "2026-10-14", note: "" };
const RULE_FIELDS = { kind: "expense", accountId: "1", counterAccountId: "", categoryId: "", amount: "15000", dayOfMonth: "6", note: "" };

beforeEach(() => {
  for (const service of [accounts, purposes, categories, setup, transactions, recurring]) {
    for (const fn of Object.values(service)) fn.mockReset().mockResolvedValue(undefined);
  }
  accounts.listAccounts.mockResolvedValue([CATHAY]);
  accounts.createAccount.mockResolvedValue(CATHAY);
  accounts.updateAccount.mockResolvedValue(CATHAY);
  accounts.deleteAccount.mockResolvedValue("國泰");
  purposes.createPurpose.mockResolvedValue({ id: 5, name: "生活費" });
  purposes.updatePurpose.mockResolvedValue({ id: 5, name: "生活費" });
  purposes.deletePurpose.mockResolvedValue("生活費");
  categories.listCategories.mockResolvedValue([]);
  categories.createCategory.mockResolvedValue({ id: 11, name: "餐飲" });
  categories.updateCategory.mockResolvedValue({ id: 11, name: "餐飲" });
  categories.deleteCategory.mockResolvedValue("餐飲");
  setup.setupDefaults.mockResolvedValue({ purposes: 3, categories: 5 });
  transactions.addTransaction.mockResolvedValue(EXPENSE);
  transactions.updateTransaction.mockResolvedValue(EXPENSE);
  transactions.deleteTransaction.mockResolvedValue(true);
  transactions.updateBalance.mockResolvedValue({ account: CATHAY, delta: -350 });
  transactions.allocateSalary.mockResolvedValue({ income: { ...EXPENSE, kind: "income", amount: 43000 }, transfers: [], remainder: 43000 });
  recurring.createRecurring.mockResolvedValue(RULE);
  recurring.updateRecurring.mockResolvedValue(RULE);
  recurring.deleteRecurring.mockResolvedValue(true);
});

describe("理財的 Server Action：寫入成功後用 updateTag 讓改到的表失效", () => {
  it.each([
    // 開始使用只建用途與分類
    ["setupAction", ["savings:categories", "savings:purposes"], () => actions.setupAction()],
    ["createAccountAction", ["savings:accounts"], () => actions.createAccountAction({}, form({ name: "國泰", kind: "deposit" }))],
    // 改名也算 明細的帳戶名稱是讀取時 join 的 月份明細的快取也標了 accounts
    ["updateAccountAction", ["savings:accounts"], () => actions.updateAccountAction({}, form({ id: "1", name: "國泰世華" }))],
    ["setAccountActiveAction", ["savings:accounts"], () => actions.setAccountActiveAction({}, form({ id: "1", active: "false" }))],
    ["moveAccountAction", ["savings:accounts"], () => actions.moveAccountAction({}, form({ id: "1", direction: "up" }))],
    // 帳戶的紀錄 含轉帳的另一邊 與固定收支跟著刪除
    ["deleteAccountAction", ["savings:accounts", "savings:recurring", "savings:transactions"], () => actions.deleteAccountAction({}, form({ id: "1" }))],
    ["createPurposeAction", ["savings:purposes"], () => actions.createPurposeAction({}, form({ name: "生活費", color: "blue" }))],
    ["updatePurposeAction", ["savings:purposes"], () => actions.updatePurposeAction({}, form({ id: "5", name: "生活費", color: "teal" }))],
    ["movePurposeAction", ["savings:purposes"], () => actions.movePurposeAction({}, form({ id: "5", direction: "down" }))],
    // 用了這個用途的帳戶改成未設定
    ["deletePurposeAction", ["savings:accounts", "savings:purposes"], () => actions.deletePurposeAction({}, form({ id: "5" }))],
    ["createCategoryAction", ["savings:categories"], () => actions.createCategoryAction({}, form({ kind: "expense", name: "餐飲", color: "orange" }))],
    ["updateCategoryAction", ["savings:categories"], () => actions.updateCategoryAction({}, form({ id: "11", name: "外食", color: "orange" }))],
    ["moveCategoryAction", ["savings:categories"], () => actions.moveCategoryAction({}, form({ id: "11", direction: "up" }))],
    // 紀錄與固定收支改成未分類
    ["deleteCategoryAction", ["savings:categories", "savings:recurring", "savings:transactions"], () => actions.deleteCategoryAction({}, form({ id: "11" }))],
    ["addTransactionAction", ["savings:transactions"], () => actions.addTransactionAction({}, form(ENTRY))],
    ["updateTransactionAction", ["savings:transactions"], () => actions.updateTransactionAction({}, form({ id: "70", ...ENTRY }))],
    ["deleteTransactionAction", ["savings:transactions"], () => actions.deleteTransactionAction({}, form({ id: "70" }))],
    ["updateBalanceAction", ["savings:transactions"], () => actions.updateBalanceAction({}, form({ accountId: "1", actual: "11650" }))],
    // 薪水與每一筆轉出都是紀錄 同一個交易寫入
    ["allocateSalaryAction", ["savings:transactions"], () => actions.allocateSalaryAction({}, form({ accountId: "1", amount: "43000", date: "2026-10-05" }))],
    ["createRecurringAction", ["savings:recurring"], () => actions.createRecurringAction({}, form(RULE_FIELDS))],
    ["updateRecurringAction", ["savings:recurring"], () => actions.updateRecurringAction({}, form({ id: "30", ...RULE_FIELDS }))],
    ["setRecurringActiveAction", ["savings:recurring"], () => actions.setRecurringActiveAction({}, form({ id: "30", active: "false" }))],
    // 自動記好的紀錄留著 但 recurring_id 改成 null
    // 紀錄上的自動標籤跟著不見 明細也要重讀
    ["deleteRecurringAction", ["savings:recurring", "savings:transactions"], () => actions.deleteRecurringAction({}, form({ id: "30" }))],
  ] as const)("%s_%j", async (_name, tags, run) => {
    expect(await run()).not.toHaveProperty("error");

    expect(updated()).toEqual([...tags].sort());
    expect(revalidateTag).not.toHaveBeenCalled();
    // updateTag 已經讓這次回應帶著重新算繪的頁面 再 refresh 是多餘的
    expect(refresh).not.toHaveBeenCalled();
  });

  it.each([
    ["deleteAccountAction", () => accounts.deleteAccount.mockResolvedValue(null), () => actions.deleteAccountAction({}, form({ id: "1" }))],
    ["deletePurposeAction", () => purposes.deletePurpose.mockResolvedValue(null), () => actions.deletePurposeAction({}, form({ id: "5" }))],
    ["deleteCategoryAction", () => categories.deleteCategory.mockResolvedValue(null), () => actions.deleteCategoryAction({}, form({ id: "11" }))],
    ["deleteTransactionAction", () => transactions.deleteTransaction.mockResolvedValue(false), () => actions.deleteTransactionAction({}, form({ id: "70" }))],
    ["deleteRecurringAction", () => recurring.deleteRecurring.mockResolvedValue(false), () => actions.deleteRecurringAction({}, form({ id: "30" }))],
  ] as const)("%s_要刪的已經不在了_沒有寫入就不失效，改用 refresh 讓畫面拿掉那一列", async (_name, gone, run) => {
    gone();

    await run();

    expect(updateTag).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("更新餘額時跟記錄的一樣（差額 0）_沒有寫入，不失效也不重繪", async () => {
    transactions.updateBalance.mockResolvedValue({ account: CATHAY, delta: 0 });

    await actions.updateBalanceAction({}, form({ accountId: "1", actual: "12000" }));

    expect(updateTag).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("開始使用時用途與分類都已經有了（什麼都沒建）_不失效，改用 refresh 讓還停在舊畫面的分頁換掉「開始使用」", async () => {
    setup.setupDefaults.mockResolvedValue({ purposes: 0, categories: 0 });

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
