import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { insertTestUsers, setupTestDb } from "@/dev/test-db";
import { savingsRecurring, savingsTransactions } from "../data/schema";
import { logQueries, savingsRows } from "../dev/db-fixtures";
import { userError } from "../dev/fixtures";
import { confirmOccurrence, skipOccurrence, type ConfirmFields } from "./recurring";
import { allocateSalary, deleteTransaction, type SalaryFields } from "./transactions";

// 待處理的確認與略過 照順序處理 每個人只能動自己的

const getDb = setupTestDb();
let me: string;
let other: string;

beforeEach(async () => {
  [me, other] = await insertTestUsers(getDb());
});

// 台北時間 2026-10-15 中午
const NOW = new Date("2026-10-15T04:00:00Z");
const CREATED = new Date("2026-08-01T04:00:00Z");

const NOT_FOUND = "找不到這個固定收支，可能已經刪除了";

const { insertAccount, insertCategory, insertHolding, insertRule, transactions, ruleOf, holdingOf } = savingsRows(getDb, () => me, {
  account: { createdAt: CREATED },
  rule: { amount: 1800, mode: "confirm", createdAt: CREATED },
});

const confirmFields = (ruleId: number, values: Partial<ConfirmFields> = {}): ConfirmFields => ({ ruleId: String(ruleId), period: "2026-10", amount: "1,652", date: "2026-10-15", note: "", shares: "", ...values });

describe("confirmOccurrence（確認待處理的一期）", () => {
  it("寫一筆紀錄（帶固定收支與期別，金額可以跟預計不同，備註沒填用名稱）並把游標推到這一期", async () => {
    const living = await insertAccount({ name: "生活費帳戶" });
    const utilities = await insertCategory({ name: "水電", color: "teal" });
    const rule = await insertRule({ accountId: living.id, categoryId: utilities.id, name: "電費", dayOfMonth: 13, lastPostedMonth: "2026-09-01" });

    const { transaction } = await confirmOccurrence(me, confirmFields(rule.id, { date: "2026-10-14" }), NOW);

    expect(transaction).toMatchObject({ userId: me, kind: "expense", accountId: living.id, categoryId: utilities.id, amount: 1652, date: "2026-10-14", note: "電費", recurringId: rule.id, recurringPeriod: "2026-10-01" });
    expect((await ruleOf(rule.id)).lastPostedMonth).toBe("2026-10-01");
  });

  it("要照順序：有更早的一期還沒處理時確認後面那期_請先處理更早的那一期；處理過的再確認一次_已經處理過了", async () => {
    const living = await insertAccount({ name: "生活費帳戶" });
    const rule = await insertRule({ accountId: living.id, dayOfMonth: 5, lastPostedMonth: "2026-08-01" });

    expect(await userError(confirmOccurrence(me, confirmFields(rule.id, { period: "2026-10" }), NOW))).toBe("請先處理更早的那一期");
    await confirmOccurrence(me, confirmFields(rule.id, { period: "2026-09" }), NOW);
    expect(await userError(confirmOccurrence(me, confirmFields(rule.id, { period: "2026-09" }), NOW))).toBe("這一期已經處理過了，請重新整理頁面");
    expect(await transactions()).toHaveLength(1);
  });

  it("沒處理的期別超過 12 期（2025-01 起每月 5 日，到 10/15 共 22 期）_一樣要從最舊的開始，確認或略過第 11 期都擋下", async () => {
    const longAgo = new Date("2025-01-01T04:00:00Z");
    const living = await insertAccount({ name: "生活費帳戶", createdAt: longAgo });
    const rule = await insertRule({ accountId: living.id, dayOfMonth: 5, createdAt: longAgo });

    expect(await userError(confirmOccurrence(me, confirmFields(rule.id, { period: "2025-11" }), NOW))).toBe("請先處理更早的那一期");
    expect(await userError(skipOccurrence(me, { ruleId: String(rule.id), period: "2025-11" }, NOW))).toBe("請先處理更早的那一期");
    expect((await ruleOf(rule.id)).lastPostedMonth).toBeNull();

    await confirmOccurrence(me, confirmFields(rule.id, { period: "2025-01", date: "2025-01-05" }), NOW);
    await skipOccurrence(me, { ruleId: String(rule.id), period: "2025-02" }, NOW);
    expect((await ruleOf(rule.id)).lastPostedMonth).toBe("2025-02-01");
  });

  it("7 天內的期別可以提早確認（10/20 那期在 10/15）；7 天以外的還沒到", async () => {
    const living = await insertAccount({ name: "生活費帳戶" });
    const rule = await insertRule({ accountId: living.id, dayOfMonth: 20, lastPostedMonth: "2026-09-01" });

    expect(await userError(confirmOccurrence(me, confirmFields(rule.id, { period: "2026-11" }), NOW))).toBe("這一期還沒到，到期前 7 天才能處理");
    await confirmOccurrence(me, confirmFields(rule.id, { period: "2026-10" }), NOW);
    expect(await userError(confirmOccurrence(me, confirmFields(rule.id, { period: "2026-11" }), NOW))).toBe("這一期還沒到，到期前 7 天才能處理");
    expect((await ruleOf(rule.id)).lastPostedMonth).toBe("2026-10-01");
  });

  it("日期照一般記帳：不能是未來、不能早於帳戶開始記帳的那天", async () => {
    const living = await insertAccount({ name: "生活費帳戶", createdAt: new Date("2026-10-10T04:00:00Z") });
    const rule = await insertRule({ accountId: living.id, dayOfMonth: 12, lastPostedMonth: "2026-09-01" });

    expect(await userError(confirmOccurrence(me, confirmFields(rule.id, { date: "2026-10-16" }), NOW))).toBe("不能記錄未來的日期");
    expect(await userError(confirmOccurrence(me, confirmFields(rule.id, { date: "2026-10-09" }), NOW))).toBe("「生活費帳戶」從 10 月 10 日開始記帳，日期不能更早");
    expect(await transactions()).toEqual([]);
  });

  it("自動記的、停用的固定收支、帳戶停用的_都不能確認，也不寫入", async () => {
    const living = await insertAccount({ name: "生活費帳戶" });
    const closed = await insertAccount({ name: "舊帳戶", active: false });
    const auto = await insertRule({ accountId: living.id, dayOfMonth: 12, mode: "auto", lastPostedMonth: "2026-09-01" });
    const paused = await insertRule({ accountId: living.id, dayOfMonth: 12, active: false, lastPostedMonth: "2026-09-01" });
    const onClosed = await insertRule({ accountId: closed.id, dayOfMonth: 12, lastPostedMonth: "2026-09-01" });

    expect(await userError(confirmOccurrence(me, confirmFields(auto.id), NOW))).toBe("這個固定收支是自動記帳，不用確認");
    expect(await userError(confirmOccurrence(me, confirmFields(paused.id), NOW))).toBe("這個固定收支已停用，請先恢復");
    expect(await userError(confirmOccurrence(me, confirmFields(onClosed.id), NOW))).toBe("這個帳戶已停用，請先恢復");
    expect(await transactions()).toEqual([]);
  });

  it("一般轉帳的固定收支碰到有持股的投資帳戶_不能確認，也不寫入、游標不動", async () => {
    const living = await insertAccount({ name: "生活費帳戶" });
    const broker = await insertAccount({ name: "臺銀證券", kind: "investment" });
    await insertHolding({ accountId: broker.id, shares: 10, cost: 2500 });
    const rule = await insertRule({ kind: "transfer", accountId: living.id, counterAccountId: broker.id, dayOfMonth: 12, lastPostedMonth: "2026-09-01" });

    expect(await userError(confirmOccurrence(me, confirmFields(rule.id), NOW))).toBe("這個投資帳戶有持股：轉進轉出請用買進或賣出");
    expect(await transactions()).toEqual([]);
    expect((await ruleOf(rule.id)).lastPostedMonth).toBe("2026-09-01");
  });

  it("確認別人的固定收支_當作找不到，沒有寫入、他的游標不動", async () => {
    const theirAccount = await insertAccount({ name: "別人的", userId: other });
    const theirs = await insertRule({ userId: other, accountId: theirAccount.id, dayOfMonth: 12, lastPostedMonth: "2026-09-01" });

    expect(await userError(confirmOccurrence(me, confirmFields(theirs.id), NOW))).toBe(NOT_FOUND);
    expect(await transactions()).toEqual([]);
    expect((await ruleOf(theirs.id)).lastPostedMonth).toBe("2026-09-01");
  });

  describe("定期定額：走買進", () => {
    async function regularBuy() {
      const bank = await insertAccount({ name: "台銀" });
      const broker = await insertAccount({ name: "臺銀證券", kind: "investment" });
      const etf = await insertHolding({ accountId: broker.id, shares: 101, cost: 22_754 });
      const rule = await insertRule({ kind: "transfer", accountId: bank.id, counterAccountId: broker.id, holdingId: etf.id, amount: 5000, dayOfMonth: 5, holidayRule: "after", lastPostedMonth: "2026-09-01" });
      return { bank, broker, etf, rule };
    }

    it("寫一筆台銀轉到證券的轉帳（股數、成本變動、期別）_持股加上股數與實際扣款；備註沒填是「買進 006208 19 股」", async () => {
      const { bank, broker, etf, rule } = await regularBuy();

      const { transaction } = await confirmOccurrence(me, confirmFields(rule.id, { amount: "4,916", shares: "19", date: "2026-10-05" }), NOW);

      expect(transaction).toMatchObject({
        kind: "transfer",
        accountId: bank.id,
        counterAccountId: broker.id,
        amount: 4916,
        holdingId: etf.id,
        shares: 19,
        costChange: 4916,
        recurringId: rule.id,
        recurringPeriod: "2026-10-01",
        note: "買進 006208 19 股",
      });
      expect(await holdingOf(etf.id)).toMatchObject({ shares: 120, cost: 27_670 });
      expect((await ruleOf(rule.id)).lastPostedMonth).toBe("2026-10-01");
    });

    it("沒填股數_請輸入買到的股數，什麼都沒寫", async () => {
      const { etf, rule } = await regularBuy();

      expect(await userError(confirmOccurrence(me, confirmFields(rule.id, { amount: "4916", date: "2026-10-05" }), NOW))).toBe("請輸入買到的股數");
      expect(await transactions()).toEqual([]);
      expect(await holdingOf(etf.id)).toMatchObject({ shares: 101, cost: 22_754 });
      expect((await ruleOf(rule.id)).lastPostedMonth).toBe("2026-09-01");
    });

    it("先鎖使用者與帳戶，再鎖持股，最後鎖固定收支，然後才寫紀錄（跟刪除帳號、帳戶、持股的連帶刪改同一個順序）", async () => {
      const { rule } = await regularBuy();
      const statements = logQueries(getDb());

      await confirmOccurrence(me, confirmFields(rule.id, { amount: "4916", shares: "19", date: "2026-10-05" }), NOW);

      const at = (pattern: RegExp) => statements.findIndex((sql) => pattern.test(sql));
      const order = [
        at(/from "core_users" where .* for key share$/i),
        at(/from "savings_accounts" where .* for share$/i),
        at(/from "savings_holdings" where .* for update$/i),
        at(/from "savings_recurring" where .* for update$/i),
        at(/^insert into "savings_transactions"/i),
        at(/^update "savings_holdings"/i),
        at(/^update "savings_recurring" set "last_posted_month"/i),
      ];
      expect(order.every((index) => index >= 0)).toBe(true);
      expect([...order].sort((a, b) => a - b)).toEqual(order);
    });
  });
});

describe("skipOccurrence（略過這一期）", () => {
  it("只推游標、不寫紀錄；一樣要照順序", async () => {
    const living = await insertAccount({ name: "生活費帳戶" });
    const rule = await insertRule({ accountId: living.id, dayOfMonth: 5, lastPostedMonth: "2026-08-01" });

    expect(await userError(skipOccurrence(me, { ruleId: String(rule.id), period: "2026-10" }, NOW))).toBe("請先處理更早的那一期");
    await skipOccurrence(me, { ruleId: String(rule.id), period: "2026-09" }, NOW);

    expect((await ruleOf(rule.id)).lastPostedMonth).toBe("2026-09-01");
    expect(await transactions()).toEqual([]);
  });

  it("停用的固定收支、帳戶停用的_不能略過（跟確認一樣），游標不動", async () => {
    const living = await insertAccount({ name: "生活費帳戶" });
    const closed = await insertAccount({ name: "舊帳戶", active: false });
    const paused = await insertRule({ accountId: living.id, dayOfMonth: 12, active: false, lastPostedMonth: "2026-09-01" });
    const onClosed = await insertRule({ kind: "transfer", accountId: living.id, counterAccountId: closed.id, dayOfMonth: 12, lastPostedMonth: "2026-09-01" });

    expect(await userError(skipOccurrence(me, { ruleId: String(paused.id), period: "2026-10" }, NOW))).toBe("這個固定收支已停用，請先恢復");
    expect(await userError(skipOccurrence(me, { ruleId: String(onClosed.id), period: "2026-10" }, NOW))).toBe("這個帳戶已停用，請先恢復");
    expect((await ruleOf(paused.id)).lastPostedMonth).toBe("2026-09-01");
    expect((await ruleOf(onClosed.id)).lastPostedMonth).toBe("2026-09-01");
  });

  it("自動記的不能略過；別人的當作找不到、游標不動", async () => {
    const living = await insertAccount({ name: "生活費帳戶" });
    const auto = await insertRule({ accountId: living.id, dayOfMonth: 12, mode: "auto" });
    const theirAccount = await insertAccount({ name: "別人的", userId: other });
    const theirs = await insertRule({ userId: other, accountId: theirAccount.id, dayOfMonth: 12 });

    expect(await userError(skipOccurrence(me, { ruleId: String(auto.id), period: "2026-10" }, NOW))).toBe("這個固定收支是自動記帳，不用確認");
    expect(await userError(skipOccurrence(me, { ruleId: String(theirs.id), period: "2026-10" }, NOW))).toBe(NOT_FOUND);
    expect((await ruleOf(theirs.id)).lastPostedMonth).toBeNull();
  });
});

describe("刪除確認來的紀錄：游標退回去，待處理會再出現", () => {
  it("刪掉這一期的紀錄_游標退回前一期，可以再確認一次", async () => {
    const living = await insertAccount({ name: "生活費帳戶" });
    const rule = await insertRule({ accountId: living.id, dayOfMonth: 12, lastPostedMonth: "2026-09-01" });
    const { transaction } = await confirmOccurrence(me, confirmFields(rule.id), NOW);

    expect(await deleteTransaction(me, transaction.id)).toBe(true);

    expect((await ruleOf(rule.id)).lastPostedMonth).toBe("2026-09-01");
    await confirmOccurrence(me, confirmFields(rule.id), NOW);
    expect(await transactions()).toHaveLength(1);
  });

  it("第一期的紀錄刪掉_游標回到 null", async () => {
    const living = await insertAccount({ name: "生活費帳戶" });
    const rule = await insertRule({ accountId: living.id, dayOfMonth: 12, createdAt: new Date("2026-10-01T04:00:00Z") });
    const { transaction } = await confirmOccurrence(me, confirmFields(rule.id), NOW);

    await deleteTransaction(me, transaction.id);

    expect((await ruleOf(rule.id)).lastPostedMonth).toBeNull();
  });

  it("游標已經在更後面的期別（刪的是更早那期的紀錄）_不退", async () => {
    const living = await insertAccount({ name: "生活費帳戶" });
    const rule = await insertRule({ accountId: living.id, dayOfMonth: 5, lastPostedMonth: "2026-08-01" });
    const september = await confirmOccurrence(me, confirmFields(rule.id, { period: "2026-09" }), NOW);
    await confirmOccurrence(me, confirmFields(rule.id, { period: "2026-10" }), NOW);

    await deleteTransaction(me, september.transaction.id);

    expect((await ruleOf(rule.id)).lastPostedMonth).toBe("2026-10-01");
  });

  it("自動記的紀錄刪掉_不退（不然排程隔天又記一次）", async () => {
    const living = await insertAccount({ name: "生活費帳戶" });
    const rule = await insertRule({ accountId: living.id, dayOfMonth: 12, mode: "auto", lastPostedMonth: "2026-10-01" });
    const [posted] = await getDb().insert(savingsTransactions).values({ userId: me, kind: "expense", accountId: living.id, amount: 390, date: "2026-10-12", recurringId: rule.id }).returning();

    await deleteTransaction(me, posted.id);

    expect((await ruleOf(rule.id)).lastPostedMonth).toBe("2026-10-01");
  });

  it("定期定額確認後刪掉_持股扣回、游標也退回", async () => {
    const bank = await insertAccount({ name: "台銀" });
    const broker = await insertAccount({ name: "臺銀證券", kind: "investment" });
    const etf = await insertHolding({ accountId: broker.id, shares: 101, cost: 22_754 });
    const rule = await insertRule({ kind: "transfer", accountId: bank.id, counterAccountId: broker.id, holdingId: etf.id, amount: 5000, dayOfMonth: 5, lastPostedMonth: "2026-09-01" });
    const { transaction } = await confirmOccurrence(me, confirmFields(rule.id, { amount: "4916", shares: "19", date: "2026-10-05" }), NOW);

    await deleteTransaction(me, transaction.id);

    expect(await holdingOf(etf.id)).toMatchObject({ shares: 101, cost: 22_754 });
    expect((await ruleOf(rule.id)).lastPostedMonth).toBe("2026-09-01");
  });
});

describe("發薪分配帶固定收支的那一期（待處理的入帳並分配）", () => {
  async function salarySetup() {
    const living = await insertAccount({ name: "生活費帳戶" });
    const bank = await insertAccount({ name: "台銀" });
    const rule = await insertRule({ kind: "income", accountId: living.id, dayOfMonth: 10, holidayRule: "before", allocate: true, amount: 52_000, lastPostedMonth: "2026-09-01" });
    return { living, bank, rule };
  }
  const salaryFields = (accountId: number, bankId: number, values: Partial<SalaryFields> = {}): SalaryFields => ({
    accountId: String(accountId),
    categoryId: "",
    amount: "51,200",
    date: "2026-10-08",
    note: "",
    transfers: [{ accountId: String(bankId), amount: "5000" }],
    ...values,
  });

  it("收入與分出去的轉帳都帶上固定收支與期別，同一個交易把游標推到這一期", async () => {
    const { living, bank, rule } = await salarySetup();

    const { income, transfers } = await allocateSalary(me, salaryFields(living.id, bank.id, { ruleId: String(rule.id), period: "2026-10" }), NOW);

    expect(income).toMatchObject({ kind: "income", amount: 51_200, recurringId: rule.id, recurringPeriod: "2026-10-01" });
    expect(transfers.map((t) => [t.amount, t.recurringId, t.recurringPeriod])).toEqual([[5000, rule.id, "2026-10-01"]]);
    expect((await ruleOf(rule.id)).lastPostedMonth).toBe("2026-10-01");
  });

  it("刪掉確認來的薪水收入_這一期分出去的轉帳一起刪、游標退回，再確認一次不會多出重複的轉帳", async () => {
    const { living, bank, rule } = await salarySetup();
    const emergency = await insertAccount({ name: "緊急預備金" });
    await getDb().update(savingsRecurring).set({ lastPostedMonth: "2026-08-01" }).where(eq(savingsRecurring.id, rule.id));
    const september = await allocateSalary(me, salaryFields(living.id, bank.id, { ruleId: String(rule.id), period: "2026-09", date: "2026-09-10" }), NOW);
    const october = await allocateSalary(
      me,
      salaryFields(living.id, bank.id, { ruleId: String(rule.id), period: "2026-10", transfers: [{ accountId: String(bank.id), amount: "5000" }, { accountId: String(emergency.id), amount: "1000" }] }),
      NOW,
    );
    const bonus = await allocateSalary(me, salaryFields(living.id, bank.id, { date: "2026-10-09" }), NOW);

    expect(await deleteTransaction(me, october.income.id)).toBe(true);

    const left = (await transactions()).map((t) => t.id);
    expect(left).toEqual([september.income.id, ...september.transfers.map((t) => t.id), bonus.income.id, ...bonus.transfers.map((t) => t.id)]);
    expect((await ruleOf(rule.id)).lastPostedMonth).toBe("2026-09-01");

    await allocateSalary(me, salaryFields(living.id, bank.id, { ruleId: String(rule.id), period: "2026-10" }), NOW);
    expect((await transactions()).filter((t) => t.recurringPeriod === "2026-10-01").map((t) => [t.kind, t.amount])).toEqual([
      ["income", 51_200],
      ["transfer", 5000],
    ]);
  });

  it("刪掉其中一筆分出去的轉帳_只刪那一筆，收入與游標不動", async () => {
    const { living, bank, rule } = await salarySetup();
    const emergency = await insertAccount({ name: "緊急預備金" });
    const { income, transfers } = await allocateSalary(
      me,
      salaryFields(living.id, bank.id, { ruleId: String(rule.id), period: "2026-10", transfers: [{ accountId: String(bank.id), amount: "5000" }, { accountId: String(emergency.id), amount: "1000" }] }),
      NOW,
    );

    expect(await deleteTransaction(me, transfers[0].id)).toBe(true);

    expect((await transactions()).map((t) => t.id)).toEqual([income.id, transfers[1].id]);
    expect((await ruleOf(rule.id)).lastPostedMonth).toBe("2026-10-01");
  });

  it("不帶固定收支（臨時的獎金）_游標不動", async () => {
    const { living, bank, rule } = await salarySetup();

    await allocateSalary(me, salaryFields(living.id, bank.id), NOW);

    expect((await ruleOf(rule.id)).lastPostedMonth).toBe("2026-09-01");
  });

  it("同一期送兩次_第二次擋下，什麼都不寫", async () => {
    const { living, bank, rule } = await salarySetup();
    await allocateSalary(me, salaryFields(living.id, bank.id, { ruleId: String(rule.id), period: "2026-10" }), NOW);

    expect(await userError(allocateSalary(me, salaryFields(living.id, bank.id, { ruleId: String(rule.id), period: "2026-10" }), NOW))).toBe("這一期已經處理過了，請重新整理頁面");
    expect(await transactions()).toHaveLength(2);
  });

  it("別人的固定收支、不是收入的固定收支_擋下，連收入也不寫", async () => {
    const { living, bank } = await salarySetup();
    const theirAccount = await insertAccount({ name: "別人的", userId: other });
    const theirs = await insertRule({ userId: other, kind: "income", accountId: theirAccount.id, dayOfMonth: 10, lastPostedMonth: "2026-09-01" });
    const expense = await insertRule({ accountId: living.id, dayOfMonth: 10, lastPostedMonth: "2026-09-01" });

    expect(await userError(allocateSalary(me, salaryFields(living.id, bank.id, { ruleId: String(theirs.id), period: "2026-10" }), NOW))).toBe(NOT_FOUND);
    expect(await userError(allocateSalary(me, salaryFields(living.id, bank.id, { ruleId: String(expense.id), period: "2026-10" }), NOW))).toBe("這個固定收支不是收入，不能用發薪分配確認");
    expect(await transactions()).toEqual([]);
    expect((await ruleOf(theirs.id)).lastPostedMonth).toBe("2026-09-01");
  });
});
