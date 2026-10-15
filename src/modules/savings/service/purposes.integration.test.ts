import { asc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { insertTestUser, setupTestDb } from "@/dev/test-db";
import { savingsAccounts, savingsPurposes } from "../data/schema";
import { SavingsUserError } from "./errors";
import { createPurpose, deletePurpose, listPurposes, movePurpose, updatePurpose } from "./purposes";

const getDb = setupTestDb();
let me: string;
let other: string;

beforeEach(async () => {
  me = await insertTestUser(getDb(), "alice", { role: "owner" });
  other = await insertTestUser(getDb(), "bob");
});

const NOT_FOUND = "找不到這個用途，可能已經刪除了";
const DUPLICATE = "已經有同名的用途";

async function insertPurpose(values: Partial<typeof savingsPurposes.$inferInsert> & { name: string }) {
  const [row] = await getDb().insert(savingsPurposes).values({ userId: me, color: "blue", ...values }).returning();
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

const rowsOf = (userId: string) => getDb().select().from(savingsPurposes).where(eq(savingsPurposes.userId, userId)).orderBy(asc(savingsPurposes.sortOrder), asc(savingsPurposes.id));
const namesOf = async (userId: string) => (await rowsOf(userId)).map((p) => p.name);

describe("listPurposes", () => {
  it("只有自己的_依排序值、同排序值再依建立順序", async () => {
    await insertPurpose({ name: "投資", sortOrder: 2 });
    await insertPurpose({ name: "生活費", sortOrder: 0 });
    await insertPurpose({ name: "緊急預備金", sortOrder: 1 });
    await insertPurpose({ name: "旅遊", sortOrder: 1 });
    await insertPurpose({ name: "別人的", userId: other });

    expect((await listPurposes(me)).map((p) => p.name)).toEqual(["生活費", "緊急預備金", "旅遊", "投資"]);
    expect((await listPurposes(other)).map((p) => p.name)).toEqual(["別人的"]);
  });
});

describe("createPurpose", () => {
  it("去掉空白後寫入_排在自己的最後面（別人的排序不算）", async () => {
    await insertPurpose({ name: "生活費", sortOrder: 4 });
    await insertPurpose({ name: "別人的", sortOrder: 9, userId: other });

    const purpose = await createPurpose(me, { name: " 旅遊 ", color: "teal" });

    expect(purpose).toMatchObject({ userId: me, name: "旅遊", color: "teal", sortOrder: 5 });
    expect(await namesOf(me)).toEqual(["生活費", "旅遊"]);
  });

  it("顏色不在色盤裡_丟使用者錯誤_沒有寫入", async () => {
    expect(await userError(createPurpose(me, { name: "生活費", color: "pink" }))).toBe("顏色不正確");
    expect(await rowsOf(me)).toEqual([]);
  });

  it("灰色留給「未設定用途」_不能選，丟使用者錯誤_沒有寫入", async () => {
    expect(await userError(createPurpose(me, { name: "生活費", color: "slate" }))).toBe("顏色不正確");
    expect(await rowsOf(me)).toEqual([]);
  });

  it("已經有同名的用途_丟使用者錯誤（資料庫的唯一索引擋下來的也一樣）", async () => {
    await insertPurpose({ name: "生活費" });

    expect(await userError(createPurpose(me, { name: "生活費", color: "amber" }))).toBe(DUPLICATE);
    expect(await namesOf(me)).toEqual(["生活費"]);
  });

  it("名稱正規化之後一樣就是同名：NFD 與 NFC、相容漢字、零寬空白、連續空白都算同一個", async () => {
    await insertPurpose({ name: "生活費" });
    await insertPurpose({ name: "緊急預備金" });
    await insertPurpose({ name: "旅遊 基金" });

    for (const name of ["生活費".normalize("NFD"), "生活\u200B費", " 生活費\uFEFF ", "緊急預\u{2F809}\uF90A", "旅遊  基金", "旅遊\u3000基金"]) {
      expect(await userError(createPurpose(me, { name, color: "rose" }))).toBe(DUPLICATE);
    }
    expect(await namesOf(me)).toEqual(["生活費", "緊急預備金", "旅遊 基金"]);
  });

  it("新增與修改都存正規化之後的名稱", async () => {
    const created = await createPurpose(me, { name: "Cafe\u0301\u200B  基金", color: "teal" });
    expect(created.name).toBe("Caf\u00e9 基金");

    expect((await updatePurpose(me, created.id, { name: "緊急預\u{2F809}\uF90A", color: "teal" })).name).toBe("緊急預備金");
  });

  it("同時新增兩個同名的用途_只有一個寫進去，另一個是同名的訊息", async () => {
    const results = await Promise.allSettled([createPurpose(me, { name: "旅遊", color: "teal" }), createPurpose(me, { name: "旅遊", color: "rose" })]);

    expect(results.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
    const [rejected] = results.flatMap((r) => (r.status === "rejected" ? [r.reason as Error] : []));
    expect(rejected).toBeInstanceOf(SavingsUserError);
    expect(rejected.message).toBe(DUPLICATE);
    expect(await namesOf(me)).toEqual(["旅遊"]);
  });

  it("別人有同名的用途_不影響", async () => {
    await insertPurpose({ name: "生活費", userId: other });

    await createPurpose(me, { name: "生活費", color: "blue" });

    expect(await namesOf(me)).toEqual(["生活費"]);
  });
});

describe("updatePurpose", () => {
  it("改名稱與顏色", async () => {
    const purpose = await insertPurpose({ name: "生活費", color: "blue" });

    expect(await updatePurpose(me, purpose.id, { name: "日常開銷", color: "green" })).toMatchObject({ id: purpose.id, name: "日常開銷", color: "green" });
    expect(await rowsOf(me)).toMatchObject([{ name: "日常開銷", color: "green" }]);
  });

  it("資料庫裡還是灰色的用途（舊資料）_照樣留著；修改時要換成可以選的顏色，留著灰色送出是顏色不正確_資料不變", async () => {
    const purpose = await insertPurpose({ name: "生活費", color: "slate" });

    expect(await userError(updatePurpose(me, purpose.id, { name: "日常開銷", color: "slate" }))).toBe("顏色不正確");
    expect(await rowsOf(me)).toMatchObject([{ name: "生活費", color: "slate" }]);
    expect(await updatePurpose(me, purpose.id, { name: "日常開銷", color: "teal" })).toMatchObject({ name: "日常開銷", color: "teal" });
  });

  it("名稱沒變只改顏色_不算同名", async () => {
    const purpose = await insertPurpose({ name: "生活費", color: "blue" });

    await updatePurpose(me, purpose.id, { name: "生活費", color: "rose" });

    expect((await rowsOf(me))[0].color).toBe("rose");
  });

  it("改成另一個用途的名稱_丟使用者錯誤_資料不變", async () => {
    await insertPurpose({ name: "生活費" });
    const travel = await insertPurpose({ name: "旅遊", color: "teal" });

    expect(await userError(updatePurpose(me, travel.id, { name: "生活費", color: "rose" }))).toBe(DUPLICATE);
    expect(await namesOf(me)).toEqual(["生活費", "旅遊"]);
  });

  it("輸入不合法_丟使用者錯誤_資料不變", async () => {
    const purpose = await insertPurpose({ name: "生活費" });

    expect(await userError(updatePurpose(me, purpose.id, { name: "", color: "blue" }))).toBe("請輸入名稱");
    expect(await namesOf(me)).toEqual(["生活費"]);
  });

  it.each([999, 2_147_483_648])("用途 %i 不存在_找不到", async (id) => {
    expect(await userError(updatePurpose(me, id, { name: "生活費", color: "blue" }))).toBe(NOT_FOUND);
  });
});

describe("movePurpose", () => {
  it("往上移_跟前一個交換", async () => {
    await insertPurpose({ name: "A", sortOrder: 0 });
    await insertPurpose({ name: "B", sortOrder: 1 });
    const c = await insertPurpose({ name: "C", sortOrder: 2 });

    await movePurpose(me, c.id, "up");

    expect(await namesOf(me)).toEqual(["A", "C", "B"]);
  });

  it("排序值都一樣時_依畫面上的順序移動並重新編號", async () => {
    const a = await insertPurpose({ name: "A", sortOrder: 0 });
    await insertPurpose({ name: "B", sortOrder: 0 });
    await insertPurpose({ name: "C", sortOrder: 0 });

    await movePurpose(me, a.id, "down");

    expect((await rowsOf(me)).map((p) => [p.name, p.sortOrder])).toEqual([
      ["B", 0],
      ["A", 1],
      ["C", 2],
    ]);
  });

  it("已經在最下面再往下_順序不變", async () => {
    await insertPurpose({ name: "A", sortOrder: 0 });
    const b = await insertPurpose({ name: "B", sortOrder: 1 });

    await movePurpose(me, b.id, "down");

    expect(await namesOf(me)).toEqual(["A", "B"]);
  });
});

describe("deletePurpose", () => {
  it("刪掉_用了這個用途的帳戶改成未設定_回傳刪掉的名稱", async () => {
    const living = await insertPurpose({ name: "生活費" });
    const keep = await insertPurpose({ name: "投資" });
    const [cathay, broker] = await getDb()
      .insert(savingsAccounts)
      .values([
        { userId: me, name: "國泰", kind: "deposit", purposeId: living.id },
        { userId: me, name: "證券", kind: "investment", purposeId: keep.id },
      ])
      .returning();

    expect(await deletePurpose(me, living.id)).toBe("生活費");

    expect(await namesOf(me)).toEqual(["投資"]);
    const accounts = await getDb().select().from(savingsAccounts).orderBy(asc(savingsAccounts.id));
    expect(accounts.map((a) => [a.id, a.purposeId])).toEqual([
      [cathay.id, null],
      [broker.id, keep.id],
    ]);
  });

  it.each([999, 2_147_483_648])("用途 %i 不存在_回傳 null", async (id) => {
    expect(await deletePurpose(me, id)).toBeNull();
  });
});

describe("每個人只看得到、改得到自己的用途", () => {
  it("修改別人的用途_當作找不到，資料不變", async () => {
    const theirs = await insertPurpose({ name: "別人的", color: "amber", userId: other });

    expect(await userError(updatePurpose(me, theirs.id, { name: "改掉", color: "blue" }))).toBe(NOT_FOUND);
    expect(await rowsOf(other)).toMatchObject([{ name: "別人的", color: "amber" }]);
  });

  it("移動別人的用途_沒有效果", async () => {
    await insertPurpose({ name: "B1", sortOrder: 0, userId: other });
    const theirs = await insertPurpose({ name: "B2", sortOrder: 1, userId: other });
    await insertPurpose({ name: "A1", sortOrder: 0 });

    await movePurpose(me, theirs.id, "up");

    expect((await rowsOf(other)).map((p) => [p.name, p.sortOrder])).toEqual([
      ["B1", 0],
      ["B2", 1],
    ]);
  });

  it("刪除別人的用途_回傳 null，用途與他的帳戶都不受影響", async () => {
    const theirs = await insertPurpose({ name: "別人的", userId: other });
    await getDb().insert(savingsAccounts).values({ userId: other, name: "他的帳戶", kind: "deposit", purposeId: theirs.id });

    expect(await deletePurpose(me, theirs.id)).toBeNull();

    expect(await namesOf(other)).toEqual(["別人的"]);
    expect((await getDb().select().from(savingsAccounts))[0].purposeId).toBe(theirs.id);
  });

  it("新用途記在登入者名下", async () => {
    await createPurpose(me, { name: "生活費", color: "blue" });

    expect(await rowsOf(other)).toEqual([]);
    expect(await namesOf(me)).toEqual(["生活費"]);
  });
});
