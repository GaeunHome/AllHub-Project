import { asc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { insertTestUser, setupTestDb } from "@/dev/test-db";
import { savingsAccounts, savingsPurposes, savingsRecurring, savingsTransactions } from "../data/schema";
import { createAccount, deleteAccount, listAccounts, moveAccount, setAccountActive, updateAccount, type AccountFields } from "./accounts";
import { SavingsUserError } from "./errors";

const getDb = setupTestDb();
let me: string;
let other: string;

beforeEach(async () => {
  me = await insertTestUser(getDb(), "alice", { role: "owner" });
  other = await insertTestUser(getDb(), "bob");
});

const NOT_FOUND = "找不到這個帳戶，可能已經刪除了";
const PURPOSE_NOT_FOUND = "找不到這個用途，可能已經刪除了";
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
  purposeId: "",
  openingBalance: "",
  openingCost: "",
  monthlyPlan: "",
  targetAmount: "",
  dueDay: "",
  payFromAccountId: "",
  ...values,
});

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
    const living = await insertPurpose("生活費");
    await insertAccount({ name: "郵局", sortOrder: 3 });
    await insertAccount({ name: "別人的", sortOrder: 9, userId: other });

    const account = await createAccount(me, fields({ name: " 國泰 ", purposeId: String(living.id), openingBalance: "12,000", monthlyPlan: "5000", targetAmount: "300000" }));

    expect(account).toMatchObject({
      userId: me,
      name: "國泰",
      kind: "deposit",
      purposeId: living.id,
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

  it("信用卡_目前未繳存成負的起始餘額_繳款日與扣款的存款帳戶", async () => {
    const cathay = await insertAccount({ name: "國泰" });

    expect(await createAccount(me, fields({ name: "國泰信用卡", kind: "credit", openingBalance: "3500", dueDay: "6", payFromAccountId: String(cathay.id) }))).toMatchObject({
      kind: "credit",
      openingBalance: -3500,
      dueDay: 6,
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

  it("用途不存在_找不到用途_沒有寫入", async () => {
    expect(await userError(createAccount(me, fields({ purposeId: "999" })))).toBe(PURPOSE_NOT_FOUND);
    expect(await rowsOf(me)).toEqual([]);
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
    const living = await insertPurpose("生活費");
    const account = await insertAccount({ name: "國泰", openingBalance: 100 });

    const updated = await updateAccount(me, account.id, fields({ name: "國泰世華", kind: "credit", purposeId: String(living.id), openingBalance: "200", monthlyPlan: "3000", targetAmount: "50000", dueDay: "6" }));

    expect(updated).toMatchObject({ id: account.id, name: "國泰世華", kind: "deposit", purposeId: living.id, openingBalance: 200, monthlyPlan: 3000, targetAmount: 50_000, dueDay: null });
    expect(await rowsOf(me)).toMatchObject([{ name: "國泰世華", kind: "deposit", openingBalance: 200 }]);
  });

  it("信用卡_改未繳、繳款日與扣款帳戶_清掉扣款帳戶", async () => {
    const cathay = await insertAccount({ name: "國泰" });
    const card = await insertAccount({ name: "卡", kind: "credit", openingBalance: -100, dueDay: 1, payFromAccountId: cathay.id });

    expect(await updateAccount(me, card.id, fields({ name: "卡", openingBalance: "2,000", dueDay: "25" }))).toMatchObject({ openingBalance: -2000, dueDay: 25, payFromAccountId: null });
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

  it("信用卡改成溢繳_起始未繳填負數", async () => {
    const card = await insertAccount({ name: "卡", kind: "credit", openingBalance: -100 });

    expect(await updateAccount(me, card.id, fields({ name: "卡", openingBalance: "-2,000" }))).toMatchObject({ openingBalance: 2000 });
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
  it("新增時用別人的用途或別人的扣款帳戶_當作找不到，沒有寫入", async () => {
    const theirPurpose = await insertPurpose("別人的", other);
    const theirAccount = await insertAccount({ name: "別人的", userId: other });

    expect(await userError(createAccount(me, fields({ purposeId: String(theirPurpose.id) })))).toBe(PURPOSE_NOT_FOUND);
    expect(await userError(createAccount(me, fields({ kind: "credit", payFromAccountId: String(theirAccount.id) })))).toBe(NOT_FOUND);
    expect(await rowsOf(me)).toEqual([]);
  });

  it("修改別人的帳戶_當作找不到，資料不變", async () => {
    const theirs = await insertAccount({ name: "別人的", openingBalance: 500, userId: other });

    expect(await userError(updateAccount(me, theirs.id, fields({ name: "改掉", openingBalance: "1" })))).toBe(NOT_FOUND);
    expect(await rowsOf(other)).toMatchObject([{ name: "別人的", openingBalance: 500 }]);
  });

  it("修改自己的帳戶時改用別人的用途或別人的扣款帳戶_當作找不到，資料不變", async () => {
    const theirPurpose = await insertPurpose("別人的", other);
    const theirAccount = await insertAccount({ name: "別人的", userId: other });
    const mine = await insertAccount({ name: "我的", kind: "credit" });

    expect(await userError(updateAccount(me, mine.id, fields({ name: "我的", purposeId: String(theirPurpose.id) })))).toBe(PURPOSE_NOT_FOUND);
    expect(await userError(updateAccount(me, mine.id, fields({ name: "我的", payFromAccountId: String(theirAccount.id) })))).toBe(NOT_FOUND);
    expect(await rowsOf(me)).toMatchObject([{ purposeId: null, payFromAccountId: null }]);
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
