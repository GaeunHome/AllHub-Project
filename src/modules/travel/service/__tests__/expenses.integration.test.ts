import { beforeEach, describe, expect, it } from "vitest";
import { stubCoreEnv } from "@/dev/test-env";
import { insertTestUser, insertTestUsers, setupTestDb } from "@/dev/test-db";

stubCoreEnv();
const { addExpense, deleteExpense, recordRepayment, settleTransfer, undoSettlement, updateExpense } = await import("../expenses");
const { balancesOf } = await import("../../lib/expenses");
const { travelExpenses } = await import("../../data/schema");
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

const dinner = () => ({ title: "晚餐", amount: "1000", currency: "TWD", rate: "", spentOn: "2026-12-01", category: "food", paidBy: me, manyPayers: false, paid: {}, split: "even", shares: [me, other], portions: {} });
const balances = async () => Object.fromEntries(balancesOf((await detail()).expenses, (await detail()).settlements));
const detail = async (userId = me) => (await tripDetail(userId, tripId))!;

describe("記一筆帳", () => {
  it("同行的人都看得到 誰付與誰分都記著", async () => {
    await addExpense(other, tripId, dinner());

    const { expenses } = await detail();

    expect(expenses).toHaveLength(1);
    expect(expenses[0]).toMatchObject({ title: "晚餐", paidBy: me, amountCents: 100000, currency: "TWD", rateMicros: 1000000, spentOn: "2026-12-01", category: "food", split: "even", payers: [{ userId: me, amountCents: 100000 }] });
    expect(new Set(expenses[0].shares.map(({ userId }) => userId))).toEqual(new Set([me, other]));
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

    expect((await detail()).expenses[0].shares).toEqual([{ userId: other, weight: null }]);
  });

  it("舊程式記的帳（沒有日期、類別、分法與付款列）讀得到：一個人付整筆、平分", async () => {
    await getDb().insert(travelExpenses).values({ tripId, paidBy: other, title: "舊的帳", amountCents: 50000, currency: "TWD", rateMicros: 1000000 });

    expect((await detail()).expenses[0]).toMatchObject({ spentOn: null, category: null, split: "even", payers: [{ userId: other, amountCents: 50000 }] });
  });

  it("照金額分：$1,000 我 700、對方 300，每個人的份存著，對方要給我 300", async () => {
    await addExpense(me, tripId, { ...dinner(), split: "amount", portions: { [me]: "700", [other]: "300" } });

    expect((await detail()).expenses[0]).toMatchObject({ split: "amount" });
    expect(new Set((await detail()).expenses[0].shares.map(({ userId, weight }) => `${userId}:${weight}`))).toEqual(new Set([`${me}:70000`, `${other}:30000`]));
    expect(await balances()).toEqual({ [me]: 300, [other]: -300 });
  });

  it("照金額分加起來不等於這筆：不收", async () => {
    await expect(addExpense(me, tripId, { ...dinner(), split: "amount", portions: { [me]: "700", [other]: "200" } })).rejects.toBeInstanceOf(TravelUserError);
    expect((await detail()).expenses).toEqual([]);
  });

  it("好幾個人付：住宿 $9,000 我 6,000、對方 3,000，兩人平分各 4,500，對方要給我 1,500；paid_by 寫付最多的我", async () => {
    await addExpense(other, tripId, { ...dinner(), title: "住宿", amount: "9000", manyPayers: true, paidBy: null, paid: { [me]: "6000", [other]: "3000" } });

    const [hotel] = (await detail()).expenses;
    expect(hotel.paidBy).toBe(me);
    expect(new Set(hotel.payers.map(({ userId, amountCents }) => `${userId}:${amountCents}`))).toEqual(new Set([`${me}:600000`, `${other}:300000`]));
    expect(await balances()).toEqual({ [me]: 1500, [other]: -1500 });
  });

  it("好幾個人付但只有一個人填：當成他一個人付", async () => {
    await addExpense(me, tripId, { ...dinner(), manyPayers: true, paidBy: null, paid: { [other]: "1000" } });

    expect((await detail()).expenses[0]).toMatchObject({ paidBy: other, payers: [{ userId: other, amountCents: 100000 }] });
  });

  it("付錢的人也只能是同行的人", async () => {
    const stranger = await insertTestUser(getDb(), "carol");

    await expect(addExpense(me, tripId, { ...dinner(), manyPayers: true, paidBy: null, paid: { [me]: "500", [stranger]: "500" } })).rejects.toBeInstanceOf(TravelUserError);
    expect((await detail()).expenses).toEqual([]);
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

    expect((await detail()).expenses[0]).toMatchObject({ title: "宵夜", shares: [{ userId: other, weight: null }] });
  });

  it("從好幾個人付改回一個人付：每人付的那幾列清掉，照比例改回平分也一樣", async () => {
    const { expenseId } = await addExpense(me, tripId, { ...dinner(), manyPayers: true, paidBy: null, paid: { [me]: "400", [other]: "600" }, split: "ratio", portions: { [me]: "2", [other]: "1" } });

    await updateExpense(me, tripId, expenseId, dinner());

    expect((await detail()).expenses[0]).toMatchObject({ paidBy: me, split: "even", payers: [{ userId: me, amountCents: 100000 }] });
    expect((await detail()).expenses[0].shares.every(({ weight }) => weight === null)).toBe(true);
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

describe("記還款", () => {
  it("任意金額：對方欠我 500，先還 200，還差 300", async () => {
    await addExpense(me, tripId, dinner());

    await recordRepayment(other, tripId, { from: other, to: me, amount: "200" });

    expect(await balances()).toEqual({ [me]: 300, [other]: -300 });
  });

  it("不是成員：當作旅程不存在；給或收的人不是這趟的人：不收", async () => {
    const stranger = await insertTestUser(getDb(), "carol");
    await addExpense(me, tripId, dinner());

    await expect(recordRepayment(stranger, tripId, { from: other, to: me, amount: "100" })).rejects.toBeInstanceOf(TripNotFoundError);
    await expect(recordRepayment(me, tripId, { from: stranger, to: me, amount: "100" })).rejects.toBeInstanceOf(TravelUserError);
    expect((await detail()).settlements).toEqual([]);
  });

  it("已經離開、還留在帳上的人照樣可以記", async () => {
    await addExpense(me, tripId, dinner());
    await leaveTrip(other, tripId);

    await recordRepayment(me, tripId, { from: other, to: me, amount: "500" });

    expect(await balances()).toEqual({ [me]: 0, [other]: 0 });
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
