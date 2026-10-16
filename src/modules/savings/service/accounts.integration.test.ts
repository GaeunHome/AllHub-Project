import type { PGlite } from "@electric-sql/pglite";
import { asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { insertTestUser, setupTestDb, type TestDb } from "@/dev/test-db";
import { savingsAccounts, savingsPurposes, savingsRecurring, savingsTransactions } from "../data/schema";
import { createAccount, deleteAccount, listAccounts, moveAccount, setAccountActive, updateAccount, updateAllocation, type AccountFields } from "./accounts";
import { SavingsUserError } from "./errors";

const getDb = setupTestDb();
let me: string;
let other: string;

beforeEach(async () => {
  me = await insertTestUser(getDb(), "alice", { role: "owner" });
  other = await insertTestUser(getDb(), "bob");
});

const NOT_FOUND = "找不到這個帳戶，可能已經刪除了";
const DUPLICATE = "已經有同名的帳戶";
const PAY_FROM_NOT_DEPOSIT = "扣款帳戶要選存款帳戶";

type AccountValues = Partial<typeof savingsAccounts.$inferInsert> & { name: string };

async function insertAccount(values: AccountValues) {
  const [row] = await getDb().insert(savingsAccounts).values({ userId: me, kind: "deposit", ...values }).returning();
  return row;
}

async function insertPurpose(name: string, userId = me) {
  const [row] = await getDb().insert(savingsPurposes).values({ userId, name, color: "blue" }).returning();
  return row;
}

/** 要是使用者錯誤畫面才會顯示訊息 不能是文字剛好一樣的其他錯誤 */
async function userError(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(SavingsUserError);
  return (error as Error).message;
}

const fields = (values: Partial<AccountFields> = {}): AccountFields => ({
  name: "國泰",
  kind: "deposit",
  label: "",
  cardStyle: "",
  openingBalance: "",
  openingCost: "",
  monthlyPlan: "",
  targetAmount: "",
  payFromAccountId: "",
  statementDay: "",
  autopay: "",
  ...values,
});

/** 修改分配的一行 */
const line = (id: number, monthlyPlan = "", targetAmount = "") => ({ accountId: String(id), monthlyPlan, targetAmount });

/** 記下送出的每一句 SQL 交易的開始記成 begin PGlite 只有一條連線 交易本來就一個一個跑 */
function logStatements(): string[] {
  const statements: string[] = [];
  const pglite = (getDb() as TestDb & { $client: PGlite }).$client;
  const transaction = pglite.transaction.bind(pglite);
  vi.spyOn(pglite, "transaction").mockImplementation(((callback: Parameters<typeof transaction>[0]) => {
    statements.push("begin");
    return transaction(callback);
  }) as typeof transaction);
  (globalThis as unknown as { hubDb?: unknown }).hubDb = drizzle(pglite, { logger: { logQuery: (sql) => statements.push(sql) } });
  return statements;
}

const rowsOf = (userId: string) => getDb().select().from(savingsAccounts).where(eq(savingsAccounts.userId, userId)).orderBy(asc(savingsAccounts.sortOrder), asc(savingsAccounts.id));
const namesOf = async (userId: string) => (await rowsOf(userId)).map((a) => a.name);

describe("listAccounts", () => {
  it("只有自己的_依排序值、同排序值再依建立順序_停用的也列出", async () => {
    await insertAccount({ name: "C", sortOrder: 2 });
    await insertAccount({ name: "A", sortOrder: 0 });
    await insertAccount({ name: "B1", sortOrder: 1, active: false });
    await insertAccount({ name: "B2", sortOrder: 1, kind: "credit" });
    await insertAccount({ name: "別人的", sortOrder: 0, userId: other });

    expect((await listAccounts(me)).map((a) => a.name)).toEqual(["A", "B1", "B2", "C"]);
    expect((await listAccounts(other)).map((a) => a.name)).toEqual(["別人的"]);
  });
});

describe("createAccount", () => {
  it("存款_起始餘額、每月規劃、目標與用途_排在自己的最後面（別人的排序不算）", async () => {
    await insertAccount({ name: "郵局", sortOrder: 3 });
    await insertAccount({ name: "別人的", sortOrder: 9, userId: other });

    const account = await createAccount(me, fields({ name: " 國泰 ", label: " 生活費 ", openingBalance: "12,000", monthlyPlan: "5000", targetAmount: "300000" }));

    expect(account).toMatchObject({
      userId: me,
      name: "國泰",
      kind: "deposit",
      label: "生活費",
      cardStyle: null,
      purposeId: null,
      openingBalance: 12_000,
      openingCost: null,
      monthlyPlan: 5000,
      targetAmount: 300_000,
      dueDay: null,
      payFromAccountId: null,
      active: true,
      sortOrder: 4,
    });
  });

  it("第一個帳戶_排序從 0 開始、起始餘額留空是 0", async () => {
    expect(await createAccount(me, fields())).toMatchObject({ sortOrder: 0, openingBalance: 0 });
  });

  it("信用卡_目前未繳存成負的起始餘額與扣款的存款帳戶；表單送來的繳款截止日不存（改成填帳單時照帳單填）", async () => {
    const cathay = await insertAccount({ name: "國泰" });
    const sent = { ...fields({ name: "國泰信用卡", kind: "credit", openingBalance: "3500", payFromAccountId: String(cathay.id) }), dueDay: "6" } as AccountFields;

    expect(await createAccount(me, sent)).toMatchObject({
      kind: "credit",
      openingBalance: -3500,
      dueDay: null,
      payFromAccountId: cathay.id,
    });
  });

  it("扣款帳戶停用了也可以選（只是不能再記帳）", async () => {
    const closed = await insertAccount({ name: "舊帳戶", active: false });

    expect(await createAccount(me, fields({ name: "卡", kind: "credit", payFromAccountId: String(closed.id) }))).toMatchObject({ payFromAccountId: closed.id });
  });

  it("投資_目前市值與成本", async () => {
    expect(await createAccount(me, fields({ name: "證券", kind: "investment", openingBalance: "80000", openingCost: "75000" }))).toMatchObject({
      kind: "investment",
      openingBalance: 80_000,
      openingCost: 75_000,
    });
  });

  it.each(["", "loan"])("類型 %j 不對_丟使用者錯誤_沒有寫入", async (kind) => {
    expect(await userError(createAccount(me, fields({ kind })))).toBe("帳戶類型不正確");
    expect(await rowsOf(me)).toEqual([]);
  });

  it("舊的表單送來用途 id_不讀也不存（用途改成帳戶上的文字）：就算是別人的或不存在的也照樣建立", async () => {
    const theirPurpose = await insertPurpose("別人的", other);

    expect(await createAccount(me, { ...fields({ name: "A" }), purposeId: String(theirPurpose.id) })).toMatchObject({ purposeId: null, label: null });
    expect(await createAccount(me, { ...fields({ name: "B" }), purposeId: "999" })).toMatchObject({ purposeId: null });
  });

  it("信用卡_卡面顏色存起來；沒選是 null", async () => {
    expect(await createAccount(me, fields({ name: "國泰卡", kind: "credit", cardStyle: "green" }))).toMatchObject({ kind: "credit", cardStyle: "green" });
    expect(await createAccount(me, fields({ name: "台新卡", kind: "credit" }))).toMatchObject({ cardStyle: null });
  });

  it("卡面顏色不在清單裡_丟使用者錯誤_沒有寫入；存款帳戶送來的卡面顏色忽略", async () => {
    expect(await userError(createAccount(me, fields({ name: "國泰卡", kind: "credit", cardStyle: "gold" })))).toBe("卡面顏色不正確");
    expect(await rowsOf(me)).toEqual([]);
    expect(await createAccount(me, fields({ cardStyle: "green" }))).toMatchObject({ kind: "deposit", cardStyle: null });
  });

  it("扣款帳戶不存在_找不到帳戶", async () => {
    expect(await userError(createAccount(me, fields({ kind: "credit", payFromAccountId: "999" })))).toBe(NOT_FOUND);
  });

  it.each(["credit", "investment"] as const)("扣款帳戶是%s帳戶_要選存款帳戶", async (kind) => {
    const notDeposit = await insertAccount({ name: "不是存款", kind });

    expect(await userError(createAccount(me, fields({ name: "卡", kind: "credit", payFromAccountId: String(notDeposit.id) })))).toBe(PAY_FROM_NOT_DEPOSIT);
    expect(await namesOf(me)).toEqual(["不是存款"]);
  });

  it("已經有同名的帳戶_丟使用者錯誤", async () => {
    await insertAccount({ name: "國泰" });

    expect(await userError(createAccount(me, fields({ kind: "credit" })))).toBe(DUPLICATE);
    expect(await namesOf(me)).toEqual(["國泰"]);
  });

  it("金額不合法_錯誤寫出是哪一欄", async () => {
    expect(await userError(createAccount(me, fields({ monthlyPlan: "0" })))).toBe("每月規劃：金額至少 1 元");
  });

  it("新增時的欄位名稱跟表單一樣：投資是目前市值、信用卡是目前未繳", async () => {
    expect(await userError(createAccount(me, fields({ kind: "investment", openingBalance: "1.5" })))).toBe("目前市值：金額只能是整數（單位：元，不能有小數或負數）");
    expect(await userError(createAccount(me, fields({ kind: "credit", openingBalance: "1.5" })))).toBe("目前未繳：金額只能是整數（單位：元，不能有小數；溢繳請輸入負數）");
    expect(await rowsOf(me)).toEqual([]);
  });

  it("信用卡溢繳_目前未繳填負數，存成正的起始餘額", async () => {
    expect(await createAccount(me, fields({ name: "卡", kind: "credit", openingBalance: "-300" }))).toMatchObject({ kind: "credit", openingBalance: 300 });
  });

  it("存款與投資的起始金額不能是負數_沒有寫入", async () => {
    expect(await userError(createAccount(me, fields({ openingBalance: "-300" })))).toBe("起始餘額：金額只能是整數（單位：元，不能有小數或負數）");
    expect(await userError(createAccount(me, fields({ kind: "investment", openingBalance: "-300" })))).toBe("目前市值：金額只能是整數（單位：元，不能有小數或負數）");
    expect(await rowsOf(me)).toEqual([]);
  });
});

describe("updateAccount", () => {
  it("改名稱、用途、起始餘額、每月規劃與目標_類型建立後不能改（送來的類型與信用卡欄位忽略）", async () => {
    const account = await insertAccount({ name: "國泰", openingBalance: 100 });

    const updated = await updateAccount(me, account.id, fields({ name: "國泰世華", kind: "credit", label: "緊急預備金", cardStyle: "blue", openingBalance: "200", monthlyPlan: "3000", targetAmount: "50000", statementDay: "5" }));

    expect(updated).toMatchObject({ id: account.id, name: "國泰世華", kind: "deposit", label: "緊急預備金", cardStyle: null, openingBalance: 200, monthlyPlan: 3000, targetAmount: 50_000, statementDay: null });
    expect(await rowsOf(me)).toMatchObject([{ name: "國泰世華", kind: "deposit", openingBalance: 200 }]);
  });

  it("信用卡_改未繳、清掉扣款帳戶；舊版設的繳款截止日不動（只當第一張帳單截止日的預設），送來新的也不收", async () => {
    const cathay = await insertAccount({ name: "國泰" });
    const card = await insertAccount({ name: "卡", kind: "credit", openingBalance: -100, dueDay: 1, payFromAccountId: cathay.id });

    expect(await updateAccount(me, card.id, fields({ name: "卡", openingBalance: "2,000" }))).toMatchObject({ openingBalance: -2000, dueDay: 1, payFromAccountId: null });
    expect(await updateAccount(me, card.id, { ...fields({ name: "卡" }), dueDay: "25" } as AccountFields)).toMatchObject({ dueDay: 1 });
  });

  it("扣款帳戶選信用卡自己_要選存款帳戶", async () => {
    const card = await insertAccount({ name: "卡", kind: "credit" });

    expect(await userError(updateAccount(me, card.id, fields({ name: "卡", payFromAccountId: String(card.id) })))).toBe(PAY_FROM_NOT_DEPOSIT);
    expect((await rowsOf(me))[0].payFromAccountId).toBeNull();
  });

  it("改成另一個帳戶的名稱_丟使用者錯誤_資料不變", async () => {
    await insertAccount({ name: "國泰" });
    const post = await insertAccount({ name: "郵局" });

    expect(await userError(updateAccount(me, post.id, fields({ name: "國泰" })))).toBe(DUPLICATE);
    expect(await namesOf(me)).toEqual(["國泰", "郵局"]);
  });

  it("輸入不合法_丟使用者錯誤_資料不變", async () => {
    const account = await insertAccount({ name: "國泰", openingBalance: 100 });

    expect(await userError(updateAccount(me, account.id, fields({ openingBalance: "-1" })))).toBe("起始餘額：金額只能是整數（單位：元，不能有小數或負數）");
    expect((await rowsOf(me))[0].openingBalance).toBe(100);
  });

  it.each([999, 2_147_483_648])("帳戶 %i 不存在_找不到", async (id) => {
    expect(await userError(updateAccount(me, id, fields()))).toBe(NOT_FOUND);
  });

  it("修改時的欄位名稱跟表單一樣：投資是起始市值、信用卡是起始未繳_資料不變", async () => {
    const broker = await insertAccount({ name: "證券", kind: "investment", openingBalance: 100 });
    const card = await insertAccount({ name: "卡", kind: "credit", openingBalance: -100 });

    expect(await userError(updateAccount(me, broker.id, fields({ name: "證券", openingBalance: "1.5" })))).toBe("起始市值：金額只能是整數（單位：元，不能有小數或負數）");
    expect(await userError(updateAccount(me, card.id, fields({ name: "卡", openingBalance: "1.5" })))).toBe("起始未繳：金額只能是整數（單位：元，不能有小數；溢繳請輸入負數）");
    expect((await rowsOf(me)).map((a) => a.openingBalance)).toEqual([100, -100]);
  });

  it("信用卡的結帳日與自動扣繳_存起來，取消勾選就關掉", async () => {
    const card = await insertAccount({ name: "國泰卡", kind: "credit" });

    expect(await updateAccount(me, card.id, fields({ name: "國泰卡", statementDay: "5", autopay: "on" }))).toMatchObject({ statementDay: 5, autopay: true });
    expect(await updateAccount(me, card.id, fields({ name: "國泰卡" }))).toMatchObject({ statementDay: null, autopay: false });
  });

  it("存款帳戶送來結帳日與自動扣繳_忽略", async () => {
    const created = await createAccount(me, fields({ statementDay: "5", autopay: "on" }));

    expect(created).toMatchObject({ statementDay: null, autopay: false });
  });

  it("信用卡改成溢繳_起始未繳填負數", async () => {
    const card = await insertAccount({ name: "卡", kind: "credit", openingBalance: -100 });

    expect(await updateAccount(me, card.id, fields({ name: "卡", openingBalance: "-2,000" }))).toMatchObject({ openingBalance: 2000 });
  });
});

describe("updateAllocation（修改分配：一次改各帳戶的每月規劃與目標）", () => {
  const ALLOCATION_INVALID = "找不到帳戶，請重新整理頁面";
  const plansOf = async (userId: string) => (await rowsOf(userId)).map((a) => [a.name, a.monthlyPlan, a.targetAmount]);

  it("存款與投資帳戶一起改；留空是不設（清掉原本的）；沒送的帳戶不動_回傳改了幾個", async () => {
    const bank = await insertAccount({ name: "台銀", monthlyPlan: 3000 });
    const reserve = await insertAccount({ name: "緊急預備金", monthlyPlan: 1000, targetAmount: 5000 });
    const broker = await insertAccount({ name: "證券", kind: "investment" });
    await insertAccount({ name: "沒送的", monthlyPlan: 700 });

    expect(await updateAllocation(me, [line(bank.id, "5,000"), line(reserve.id, "", ""), line(broker.id, "3000", "100000")])).toBe(3);

    expect(await plansOf(me)).toEqual([
      ["台銀", 5000, null],
      ["緊急預備金", null, null],
      ["證券", 3000, 100_000],
      ["沒送的", 700, null],
    ]);
  });

  it("停用的存款帳戶也可以改（只是不會出現在發薪分配的建議）", async () => {
    const closed = await insertAccount({ name: "舊帳戶", active: false });

    expect(await updateAllocation(me, [line(closed.id, "1000")])).toBe(1);
    expect(await plansOf(me)).toEqual([["舊帳戶", 1000, null]]);
  });

  it("其中一個是信用卡（不能分配）_整批拒絕，一個都沒改", async () => {
    const bank = await insertAccount({ name: "台銀", monthlyPlan: 3000 });
    const card = await insertAccount({ name: "國泰卡", kind: "credit" });

    expect(await userError(updateAllocation(me, [line(bank.id, "5000"), line(card.id, "100")]))).toBe(ALLOCATION_INVALID);
    expect(await plansOf(me)).toEqual([
      ["台銀", 3000, null],
      ["國泰卡", null, null],
    ]);
  });

  it("其中一個金額不對_整批不寫，錯誤寫出是哪個帳戶", async () => {
    const bank = await insertAccount({ name: "台銀", monthlyPlan: 3000 });
    const reserve = await insertAccount({ name: "緊急預備金" });

    expect(await userError(updateAllocation(me, [line(bank.id, "5000"), line(reserve.id, "-1")]))).toBe("「緊急預備金」的每月規劃：金額只能是正整數（單位：元，不能有小數或負數）");
    expect(await plansOf(me)).toEqual([
      ["台銀", 3000, null],
      ["緊急預備金", null, null],
    ]);
  });

  it.each([999, 2_147_483_648])("帳戶 %i 不存在_整批拒絕", async (id) => {
    const bank = await insertAccount({ name: "台銀", monthlyPlan: 3000 });

    expect(await userError(updateAllocation(me, [line(bank.id, "5000"), line(id, "1")]))).toBe(ALLOCATION_INVALID);
    expect(await plansOf(me)).toEqual([["台銀", 3000, null]]);
  });

  it("交易裡先鎖使用者、再鎖帳戶，最後才改：刪除帳號的連帶刪除不一定照 id 的順序刪帳戶，沒先鎖使用者時兩邊會互相等到被資料庫中止（deadlock）", async () => {
    const bank = await insertAccount({ name: "台銀" });
    const reserve = await insertAccount({ name: "緊急預備金" });
    const statements = logStatements();

    await updateAllocation(me, [line(bank.id, "5000"), line(reserve.id, "2000")]);

    const at = (pattern: RegExp) => statements.findIndex((sql) => pattern.test(sql));
    const order = [at(/^begin$/), at(/from "core_users" where .* for key share$/i), at(/from "savings_accounts" where .* for no key update$/i), at(/^update "savings_accounts"/i)];
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
});

describe("setAccountActive", () => {
  it("停用後再恢復", async () => {
    const account = await insertAccount({ name: "國泰" });

    await setAccountActive(me, account.id, false);
    expect((await rowsOf(me))[0].active).toBe(false);

    await setAccountActive(me, account.id, true);
    expect((await rowsOf(me))[0].active).toBe(true);
  });

  it.each([999, 2_147_483_648])("帳戶 %i 不存在_找不到", async (id) => {
    expect(await userError(setAccountActive(me, id, false))).toBe(NOT_FOUND);
  });
});

describe("moveAccount", () => {
  it("往下移_跟後一個交換", async () => {
    const a = await insertAccount({ name: "A", sortOrder: 0 });
    await insertAccount({ name: "B", sortOrder: 1 });
    await insertAccount({ name: "C", sortOrder: 2 });

    await moveAccount(me, a.id, "down");

    expect(await namesOf(me)).toEqual(["B", "A", "C"]);
  });

  it("只在同一類型裡移：存款往上移跳過中間的信用卡，跟前一個存款交換；信用卡的排序不動", async () => {
    await insertAccount({ name: "A", sortOrder: 0 });
    const card = await insertAccount({ name: "卡", kind: "credit", sortOrder: 1 });
    const b = await insertAccount({ name: "B", sortOrder: 2 });

    await moveAccount(me, b.id, "up");

    const rows = await rowsOf(me);
    expect(rows.filter((a) => a.kind === "deposit").map((a) => a.name)).toEqual(["B", "A"]);
    expect(rows.find((a) => a.id === card.id)?.sortOrder).toBe(1);
  });

  it("已經是那一類的第一個_往上移沒有效果（不會跟別的類型交換）", async () => {
    await insertAccount({ name: "A", sortOrder: 0 });
    const card = await insertAccount({ name: "卡", kind: "credit", sortOrder: 1 });

    await moveAccount(me, card.id, "up");

    expect(await namesOf(me)).toEqual(["A", "卡"]);
  });

  it("停用的帳戶不參與（收在最下面）：中間夾著停用的帳戶時，往上移直接跟前一個啟用中的交換；停用的帳戶移不動", async () => {
    await insertAccount({ name: "A", sortOrder: 0 });
    const closed = await insertAccount({ name: "停用的", sortOrder: 1, active: false });
    const b = await insertAccount({ name: "B", sortOrder: 2 });

    await moveAccount(me, b.id, "up");
    expect((await rowsOf(me)).filter((a) => a.active).map((a) => a.name)).toEqual(["B", "A"]);

    const before = (await rowsOf(me)).map((a) => [a.name, a.sortOrder]);
    await moveAccount(me, closed.id, "up");
    expect((await rowsOf(me)).map((a) => [a.name, a.sortOrder])).toEqual(before);
  });

  it("排序值重複_依畫面上的順序移動並重新編號", async () => {
    await insertAccount({ name: "A", sortOrder: 5 });
    await insertAccount({ name: "B", sortOrder: 5 });
    const c = await insertAccount({ name: "C", sortOrder: 5 });

    await moveAccount(me, c.id, "up");

    expect((await rowsOf(me)).map((a) => [a.name, a.sortOrder])).toEqual([
      ["A", 0],
      ["C", 1],
      ["B", 2],
    ]);
  });
});

describe("deleteAccount", () => {
  it("刪掉帳戶_它的紀錄（含轉帳的另一邊）與固定收支一起刪_用它扣款的卡改成沒有扣款帳戶_回傳刪掉的名稱", async () => {
    const cathay = await insertAccount({ name: "國泰" });
    const post = await insertAccount({ name: "郵局" });
    const card = await insertAccount({ name: "卡", kind: "credit", payFromAccountId: cathay.id });
    await getDb()
      .insert(savingsTransactions)
      .values([
        { userId: me, kind: "expense", accountId: cathay.id, amount: 1, date: "2026-10-01" },
        { userId: me, kind: "transfer", accountId: post.id, counterAccountId: cathay.id, amount: 2, date: "2026-10-01" },
        { userId: me, kind: "transfer", accountId: cathay.id, counterAccountId: card.id, amount: 3, date: "2026-10-01" },
        { userId: me, kind: "expense", accountId: post.id, amount: 4, date: "2026-10-01" },
      ]);
    await getDb()
      .insert(savingsRecurring)
      .values([
        { userId: me, kind: "expense", accountId: cathay.id, amount: 5, dayOfMonth: 1 },
        { userId: me, kind: "transfer", accountId: post.id, counterAccountId: cathay.id, amount: 6, dayOfMonth: 1 },
        { userId: me, kind: "expense", accountId: post.id, amount: 7, dayOfMonth: 1 },
      ]);

    expect(await deleteAccount(me, cathay.id)).toBe("國泰");

    expect(await namesOf(me)).toEqual(["郵局", "卡"]);
    expect((await getDb().select().from(savingsTransactions)).map((t) => t.amount)).toEqual([4]);
    expect((await getDb().select().from(savingsRecurring)).map((r) => r.amount)).toEqual([7]);
    expect((await rowsOf(me)).find((a) => a.id === card.id)?.payFromAccountId).toBeNull();
  });

  it.each([999, 2_147_483_648])("帳戶 %i 不存在_回傳 null", async (id) => {
    expect(await deleteAccount(me, id)).toBeNull();
  });
});

describe("每個人只看得到、改得到自己的帳戶", () => {
  it("新增時用別人的扣款帳戶_當作找不到，沒有寫入", async () => {
    const theirAccount = await insertAccount({ name: "別人的", userId: other });

    expect(await userError(createAccount(me, fields({ kind: "credit", payFromAccountId: String(theirAccount.id) })))).toBe(NOT_FOUND);
    expect(await rowsOf(me)).toEqual([]);
  });

  it("修改別人的帳戶_當作找不到，資料不變", async () => {
    const theirs = await insertAccount({ name: "別人的", openingBalance: 500, userId: other });

    expect(await userError(updateAccount(me, theirs.id, fields({ name: "改掉", openingBalance: "1" })))).toBe(NOT_FOUND);
    expect(await rowsOf(other)).toMatchObject([{ name: "別人的", openingBalance: 500 }]);
  });

  it("修改自己的帳戶時改用別人的扣款帳戶_當作找不到，資料不變", async () => {
    const theirAccount = await insertAccount({ name: "別人的", userId: other });
    const mine = await insertAccount({ name: "我的", kind: "credit", label: "生活費" });

    expect(await userError(updateAccount(me, mine.id, fields({ name: "我的", payFromAccountId: String(theirAccount.id) })))).toBe(NOT_FOUND);
    expect(await rowsOf(me)).toMatchObject([{ label: "生活費", payFromAccountId: null }]);
  });

  it("修改帳戶時舊資料的用途 id 不動（不讀也不寫，之後的版本刪欄位）", async () => {
    const living = await insertPurpose("生活費");
    const mine = await insertAccount({ name: "我的", purposeId: living.id });

    expect(await updateAccount(me, mine.id, fields({ name: "我的", label: "生活費" }))).toMatchObject({ purposeId: living.id, label: "生活費" });
  });

  it("修改分配時夾帶別人的帳戶（IDOR）_整批拒絕，自己的與別人的都沒改；錯誤也不寫出別人的帳戶名稱", async () => {
    const mine = await insertAccount({ name: "台銀", monthlyPlan: 3000 });
    const theirs = await insertAccount({ name: "別人的存款", monthlyPlan: 500, userId: other });

    const error = await userError(updateAllocation(me, [line(mine.id, "5000"), line(theirs.id, "0")]));

    expect(error).not.toContain("別人的存款");
    expect(await userError(updateAllocation(me, [line(mine.id, "5000"), line(theirs.id, "99999")]))).toBe("找不到帳戶，請重新整理頁面");
    expect(await userError(updateAllocation(me, [line(theirs.id, "99999")]))).toBe("找不到帳戶，請重新整理頁面");
    expect((await rowsOf(me))[0].monthlyPlan).toBe(3000);
    expect((await rowsOf(other))[0].monthlyPlan).toBe(500);
  });

  it("停用別人的帳戶_當作找不到，資料不變", async () => {
    const theirs = await insertAccount({ name: "別人的", userId: other });

    expect(await userError(setAccountActive(me, theirs.id, false))).toBe(NOT_FOUND);
    expect((await rowsOf(other))[0].active).toBe(true);
  });

  it("移動別人的帳戶_沒有效果", async () => {
    await insertAccount({ name: "B1", sortOrder: 0, userId: other });
    const theirs = await insertAccount({ name: "B2", sortOrder: 1, userId: other });
    await insertAccount({ name: "A1", sortOrder: 0 });

    await moveAccount(me, theirs.id, "up");

    expect((await rowsOf(other)).map((a) => [a.name, a.sortOrder])).toEqual([
      ["B1", 0],
      ["B2", 1],
    ]);
  });

  it("刪除別人的帳戶_回傳 null，帳戶與他的紀錄都不受影響", async () => {
    const theirs = await insertAccount({ name: "別人的", userId: other });
    await getDb().insert(savingsTransactions).values({ userId: other, kind: "expense", accountId: theirs.id, amount: 1, date: "2026-10-01" });

    expect(await deleteAccount(me, theirs.id)).toBeNull();

    expect(await namesOf(other)).toEqual(["別人的"]);
    expect(await getDb().select().from(savingsTransactions)).toHaveLength(1);
  });

  it("新帳戶記在登入者名下_別人有同名的不影響", async () => {
    await insertAccount({ name: "國泰", userId: other });

    await createAccount(me, fields());

    expect(await namesOf(me)).toEqual(["國泰"]);
    expect(await namesOf(other)).toEqual(["國泰"]);
  });
});
