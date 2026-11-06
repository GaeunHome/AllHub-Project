import { beforeEach, describe, expect, it } from "vitest";
import { stubCoreEnv } from "@/dev/test-env";
import { insertTestUser, insertTestUsers, setupTestDb } from "@/dev/test-db";

stubCoreEnv();
const { addExpense, deleteExpense, settleTransfer, undoSettlement, updateExpense } = await import("../expenses");
const { joinToken } = await import("../join-link");
const { TripNotFoundError, TravelUserError } = await import("../errors");
const { createTrip, joinTrip, leaveTrip, setJoinLink, tripDetail } = await import("../trips");

const getDb = setupTestDb();
const TRIP = { title: "京都五日遊", destination: "京都", startDate: "2026-12-01", endDate: "2026-12-03" };

let me: string;
let other: string;
let tripId: number;
beforeEach(async () => {
  [me, other] = await insertTestUsers(getDb());
  tripId = (await createTrip(me, TRIP)).id;
  await setJoinLink(me, tripId, true);
  await joinTrip(other, tripId, joinToken(tripId, 0));
});

const dinner = () => ({ title: "晚餐", amount: "1000", currency: "TWD", rate: "", paidBy: me, shares: [me, other] });
const detail = async (userId = me) => (await tripDetail(userId, tripId))!;

describe("記一筆帳", () => {
  it("同行的人都看得到 誰付與誰分都記著", async () => {
    await addExpense(other, tripId, dinner());

    const { expenses } = await detail();

    expect(expenses).toHaveLength(1);
    expect(expenses[0]).toMatchObject({ title: "晚餐", paidBy: me, amountCents: 100000, currency: "TWD", rateMicros: 1000000 });
    expect(new Set(expenses[0].shares)).toEqual(new Set([me, other]));
  });

  it("不是同行的人不能付也不能分 整筆不寫入", async () => {
    const stranger = await insertTestUser(getDb(), "carol");

    await expect(addExpense(me, tripId, { ...dinner(), paidBy: stranger })).rejects.toBeInstanceOf(TravelUserError);
    await expect(addExpense(me, tripId, { ...dinner(), shares: [me, stranger] })).rejects.toBeInstanceOf(TravelUserError);
    expect((await detail()).expenses).toEqual([]);
  });

  it("沒有人分：不收", async () => {
    await expect(addExpense(me, tripId, { ...dinner(), shares: [] })).rejects.toBeInstanceOf(TravelUserError);
  });

  it("同一個人重複勾 只算一份", async () => {
    await addExpense(me, tripId, { ...dinner(), shares: [other, other] });

    expect((await detail()).expenses[0].shares).toEqual([other]);
  });
});

describe("不是成員碰不到（IDOR）", () => {
  it("新增 修改 刪除 結清與復原都當作旅程不存在", async () => {
    const stranger = await insertTestUser(getDb(), "carol");
    const { expenseId } = await addExpense(me, tripId, dinner());
    await settleTransfer(me, tripId, { from: other, to: me, amount: 500 });
    const [settled] = (await detail()).settlements;

    await expect(addExpense(stranger, tripId, { ...dinner(), paidBy: stranger, shares: [stranger] })).rejects.toBeInstanceOf(TripNotFoundError);
    await expect(updateExpense(stranger, tripId, expenseId, dinner())).rejects.toBeInstanceOf(TripNotFoundError);
    await expect(deleteExpense(stranger, tripId, expenseId)).rejects.toBeInstanceOf(TripNotFoundError);
    await expect(settleTransfer(stranger, tripId, { from: other, to: me, amount: 500 })).rejects.toBeInstanceOf(TripNotFoundError);
    await expect(undoSettlement(stranger, tripId, settled.id)).rejects.toBeInstanceOf(TripNotFoundError);
    expect((await detail()).expenses).toHaveLength(1);
    expect((await detail()).settlements).toHaveLength(1);
  });

  it("用自己的旅程帶別趟的帳 id：找不到 別趟的帳不動", async () => {
    const { expenseId } = await addExpense(me, tripId, dinner());
    const stranger = await insertTestUser(getDb(), "carol");
    const mine = (await createTrip(stranger, TRIP)).id;

    await expect(updateExpense(stranger, mine, expenseId, { ...dinner(), paidBy: stranger, shares: [stranger] })).rejects.toBeInstanceOf(TravelUserError);
    await expect(deleteExpense(stranger, mine, expenseId)).rejects.toBeInstanceOf(TravelUserError);
    expect((await detail()).expenses).toHaveLength(1);
  });
});

describe("修改與刪除", () => {
  it("同行的人都能改 分的人跟著換", async () => {
    const { expenseId } = await addExpense(me, tripId, dinner());

    await updateExpense(other, tripId, expenseId, { ...dinner(), title: "宵夜", shares: [other] });

    expect((await detail()).expenses[0]).toMatchObject({ title: "宵夜", shares: [other] });
  });

  it("已經離開的人留在舊帳上 修改時不會被擋", async () => {
    const { expenseId } = await addExpense(me, tripId, dinner());
    await leaveTrip(other, tripId);

    await updateExpense(me, tripId, expenseId, { ...dinner(), title: "宵夜" });

    expect((await detail()).expenses[0].title).toBe("宵夜");
  });

  it("離開的人的名字還讀得到 帳才看得懂", async () => {
    await addExpense(me, tripId, dinner());
    await leaveTrip(other, tripId);

    const { members, people } = await detail();

    expect(members.map(({ id }) => id)).toEqual([me]);
    expect(new Set(people.map(({ id }) => id))).toEqual(new Set([me, other]));
  });

  it("刪掉帳 分的人一起刪", async () => {
    const { expenseId } = await addExpense(me, tripId, dinner());

    await deleteExpense(me, tripId, expenseId);

    expect((await detail()).expenses).toEqual([]);
  });
});

describe("結清", () => {
  it("只收現在真的該給的那一筆 帳改過就要重新看", async () => {
    await addExpense(me, tripId, dinner());

    await expect(settleTransfer(me, tripId, { from: other, to: me, amount: 400 })).rejects.toBeInstanceOf(TravelUserError);
    await expect(settleTransfer(me, tripId, { from: me, to: other, amount: 500 })).rejects.toBeInstanceOf(TravelUserError);
    expect((await detail()).settlements).toEqual([]);
  });

  it("結清後再記新的帳 只算差額 復原後回到原本", async () => {
    await addExpense(me, tripId, dinner());
    await settleTransfer(other, tripId, { from: other, to: me, amount: 500 });
    await addExpense(other, tripId, { ...dinner(), paidBy: other, amount: "600" });

    await expect(settleTransfer(me, tripId, { from: me, to: other, amount: 300 })).resolves.toBeUndefined();

    const [first, second] = (await detail()).settlements;
    await undoSettlement(me, tripId, second.id);
    expect((await detail()).settlements.map(({ id }) => id)).toEqual([first.id]);
  });
});
