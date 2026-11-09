import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { coreServiceStatus, coreUsers } from "@/core/db/schema";
import { fakeFetch } from "@/dev/fake-fetch";
import { insertTestUsers, setupTestDb } from "@/dev/test-db";
import { savingsAssetSnapshots } from "../../data/schema";
import { savingsRows } from "../../dev/db-fixtures";
import { listAssetSnapshots, recordAssetSnapshots } from "../trend";

// 排程 savings:trend 使用者選的每月記一筆 前一天那個月的投資市值

const getDb = setupTestDb();
let me: string;
let other: string;

beforeEach(async () => {
  [me, other] = await insertTestUsers(getDb());
});

const mine = savingsRows(getDb, () => me, { account: { kind: "investment" } });
const theirs = savingsRows(getDb, () => other, { account: { kind: "investment" } });

// 兩份清單各要 100 筆以上才算讀到 照收盤價的真實格式
const filler = (from: number, key: "Code" | "SecuritiesCompanyCode", name: "Name" | "CompanyName", price: "ClosingPrice" | "Close") =>
  Array.from({ length: 100 }, (_, i) => ({ Date: "1151031", [key]: String(from + i), [name]: `股票${i}`, [price]: "10.00" }));
const quotesFetch = (price = "258.70") =>
  fakeFetch(({ url }) =>
    Response.json(
      url.includes("twse")
        ? [{ Date: "1151031", Code: "006208", Name: "富邦台50", ClosingPrice: price }, ...filler(1101, "Code", "Name", "ClosingPrice")]
        : [{ Date: "1151031", SecuritiesCompanyCode: "00679B", CompanyName: "元大美債20年", Close: "25.05" }, ...filler(3201, "SecuritiesCompanyCode", "CompanyName", "Close")],
    ),
  );
const brokenFetch = () => fakeFetch(() => new Response("down", { status: 503 }));

/** 台北時間凌晨 00:45 排程在這個時候跑 */
const runAt = (date: string) => new Date(`${date}T00:45:00+08:00`);
const rows = () => getDb().select().from(savingsAssetSnapshots);

describe("recordAssetSnapshots：每天記下前一天那個月的投資市值", () => {
  it("11/1 凌晨記的是 10 月：持股 1,000 股 006208 收盤 258.70 是 258,700，加上沒有持股的證券帳戶帳上 50,000", async () => {
    const broker = await mine.insertAccount({ name: "元大證券" });
    await mine.insertHolding({ accountId: broker.id, shares: 1_000, cost: 200_000 });
    await mine.insertAccount({ name: "基金", openingBalance: 50_000 });

    await recordAssetSnapshots(runAt("2026-11-01"), quotesFetch().impl);

    expect(await rows()).toMatchObject([{ userId: me, month: "2026-10-01", investment: 308_700 }]);
  });

  it("同一個月每天覆蓋那一列，不多一列：月底那天跑完就是那個月最後的市值", async () => {
    const broker = await mine.insertAccount({ name: "元大證券" });
    await mine.insertHolding({ accountId: broker.id, shares: 100 });

    await recordAssetSnapshots(runAt("2026-11-10"), quotesFetch("250.00").impl);
    await recordAssetSnapshots(runAt("2026-11-11"), quotesFetch("260.00").impl);

    expect(await rows()).toMatchObject([{ month: "2026-11-01", investment: 26_000 }]);
  });

  it("每個人只算自己的帳戶與持股", async () => {
    await mine.insertAccount({ name: "基金", openingBalance: 1_000 });
    await theirs.insertAccount({ name: "基金", openingBalance: 7_000 });

    await recordAssetSnapshots(runAt("2026-11-10"), quotesFetch().impl);

    const byUser = Object.fromEntries((await rows()).map((row) => [row.userId, row.investment]));
    expect(byUser).toEqual({ [me]: 1_000, [other]: 7_000 });
  });

  it("停用的人不記：資料凍結，那幾個月畫面照成本算", async () => {
    await theirs.insertAccount({ name: "基金", openingBalance: 7_000 });
    await getDb().update(coreUsers).set({ disabledAt: new Date() }).where(eq(coreUsers.id, other));

    await recordAssetSnapshots(runAt("2026-11-10"), quotesFetch().impl);

    expect(await rows()).toEqual([]);
  });

  it("股價讀不到時有持股的人今天不記（不能把成本當成市值），沒有持股的照記；系統狀態記下收盤價讀不到", async () => {
    const broker = await mine.insertAccount({ name: "元大證券" });
    await mine.insertHolding({ accountId: broker.id, shares: 100 });
    await theirs.insertAccount({ name: "基金", openingBalance: 7_000 });

    const summary = await recordAssetSnapshots(runAt("2026-11-10"), brokenFetch().impl);

    expect((await rows()).map((row) => row.userId)).toEqual([other]);
    expect(summary).toContain("1 人");
    const [status] = await getDb().select().from(coreServiceStatus).where(eq(coreServiceStatus.service, "savings:quotes"));
    expect(status?.lastError).toBeTruthy();
  });

  it("沒有證券帳戶的人不記，也不讀股價", async () => {
    await mine.insertAccount({ name: "薪轉", kind: "deposit", openingBalance: 9_000 });
    const fetch = quotesFetch();

    await recordAssetSnapshots(runAt("2026-11-10"), fetch.impl);

    expect(await rows()).toEqual([]);
    expect(fetch.calls).toEqual([]);
  });
});

describe("listAssetSnapshots", () => {
  it("只讀自己的，月份寫成 YYYY-MM，舊的在前", async () => {
    await getDb()
      .insert(savingsAssetSnapshots)
      .values([
        { userId: me, month: "2026-10-01", investment: 300 },
        { userId: me, month: "2026-09-01", investment: 200 },
        { userId: other, month: "2026-10-01", investment: 999 },
      ]);

    expect(await listAssetSnapshots(me)).toEqual([
      { month: "2026-09", investment: 200 },
      { month: "2026-10", investment: 300 },
    ]);
  });
});
