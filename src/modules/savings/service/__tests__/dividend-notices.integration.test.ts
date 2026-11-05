import { asc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { coreNotifications, coreUsers } from "@/core/db/schema";
import { fakeFetch } from "@/dev/fake-fetch";
import { insertTestUsers, setupTestDb } from "@/dev/test-db";
import { captureErrorLog, loggedText, mocksOf } from "@/dev/test-helpers";
import { savingsDividendNotices } from "../../data/schema";
import { savingsRows } from "../../dev/db-fixtures";

// 排程 savings:dividends 寄的除權息通知 沒設定回應時 notify 照常寫進資料庫
vi.mock("@/core/notify", { spy: true });
const { notify } = mocksOf(await import("@/core/notify"), "notify");
const { sendDividendNotices } = await import("../dividend-notices");

const getDb = setupTestDb();
let me: string;
let other: string;

beforeEach(async () => {
  notify.mockReset();
  [me, other] = await insertTestUsers(getDb());
});

/** 台北早上 8 點多 開盤前 排程在這個時候跑 */
const runAt = (date: string) => new Date(`${date}T08:10:00+08:00`);

const { insertAccount, insertHolding } = savingsRows(getDb, () => me, { account: { kind: "investment" } });

/** 一個證券帳戶 持有 shares 股的 006208 富邦台50 */
async function holding(shares: number, values: { symbol?: string; name?: string } = {}) {
  const account = await insertAccount({ name: "元大證券" });
  return insertHolding({ accountId: account.id, shares, ...values });
}

// 兩個預告表的日期是民國年 現金股利還沒公布時證交所是空字串 櫃買中心是尚未公告
const roc = (date: string) => `${Number(date.slice(0, 4)) - 1911}${date.slice(5, 7)}${date.slice(8)}`;
const twse = (date: string, code: string, cash: string, kind = "息") => ({ Date: roc(date), Code: code, Name: "", Exdividend: kind, StockDividendRatio: "", CashDividend: cash });
const tpex = (date: string, code: string, cash: string) => ({
  ExRrightsExDividendDate: roc(date),
  SecuritiesCompanyCode: code,
  CompanyName: "",
  ExRrightsExDividend: "除息",
  StockDividendRatio: "0.00000000",
  CashDividend: cash,
});

/** 數字是那個來源回的狀態碼 */
function exchanges(twseRows: unknown[] | number, tpexRows: unknown[] | number = []) {
  return fakeFetch(({ url }) => {
    const answer = new URL(url).host === "openapi.twse.com.tw" ? twseRows : tpexRows;
    return typeof answer === "number" ? new Response("secret-detail", { status: answer }) : Response.json(answer);
  });
}

const notices = () =>
  getDb()
    .select({ userId: coreNotifications.userId, module: coreNotifications.module, kind: coreNotifications.kind, title: coreNotifications.title, url: coreNotifications.url })
    .from(coreNotifications)
    .orderBy(asc(coreNotifications.id));
const titles = async () => (await notices()).map((notice) => notice.title);
const sentRows = () =>
  getDb()
    .select({ symbol: savingsDividendNotices.symbol, exDate: savingsDividendNotices.exDate, amountNotified: savingsDividendNotices.amountNotified, reminded: savingsDividendNotices.reminded })
    .from(savingsDividendNotices)
    .orderBy(asc(savingsDividendNotices.id));

describe("除權息通知：公布除息日一次、配息金額補上時一次、除息前一個交易日提醒最後買進日", () => {
  it("006208 11/18 除息、持有 1000 股_10/29 公布（金額還沒公布）、11/2 補上每股 1.72 元、11/17 最後買進日；同一天再跑不重複寄", async () => {
    await holding(1000);
    const before = exchanges([twse("2026-11-18", "006208", "")]).impl;
    const announced = exchanges([twse("2026-11-18", "006208", "1.720000")]).impl;

    expect(await sendDividendNotices(runAt("2026-10-29"), before)).toBe("寄出 1 則除權息通知");
    expect(await sendDividendNotices(runAt("2026-10-29"), before)).toBe("今天沒有要寄的除權息通知");
    expect(await sendDividendNotices(runAt("2026-10-30"), before)).toBe("今天沒有要寄的除權息通知");
    for (const day of ["2026-11-02", "2026-11-02", "2026-11-16", "2026-11-17", "2026-11-17", "2026-11-18"]) await sendDividendNotices(runAt(day), announced);

    const page = { userId: me, module: "savings", url: "/savings/investments" };
    expect(await notices()).toEqual([
      { ...page, kind: "dividend_announced", title: "006208 富邦台50 11/18 除息：配息金額還沒公布" },
      { ...page, kind: "dividend_amount", title: "006208 富邦台50 配息公布：每股配息 1.72 元，估計 $1,720（11/18 除息）" },
      { ...page, kind: "dividend_last_buy", title: "今天是最後買進日：006208 富邦台50 11/18 除息，每股配息 1.72 元，估計 $1,720" },
    ]);
  });

  it("公布時就有金額_第一則就寫出金額，之後不再寄配息公布", async () => {
    await holding(1000);
    const feed = exchanges([twse("2026-11-18", "006208", "1.720000")]).impl;

    await sendDividendNotices(runAt("2026-10-29"), feed);
    await sendDividendNotices(runAt("2026-11-02"), feed);

    expect(await titles()).toEqual(["006208 富邦台50 11/18 除息：每股配息 1.72 元，估計 $1,720"]);
  });

  it("第一次看到就是最後買進日（10/30 週五除息、今天 10/29）_併成一則最後買進日，不另外寄公布", async () => {
    await holding(1000, { symbol: "0056", name: "元大高股息" });
    const feed = exchanges([twse("2026-10-30", "0056", "0.866000")]).impl;

    expect(await sendDividendNotices(runAt("2026-10-29"), feed)).toBe("寄出 1 則除權息通知");
    await sendDividendNotices(runAt("2026-10-30"), feed);

    expect(await notices()).toEqual([
      { userId: me, module: "savings", kind: "dividend_last_buy", title: "今天是最後買進日：0056 元大高股息 10/30 除息，每股配息 0.866 元，估計 $866", url: "/savings/investments" },
    ]);
  });

  it("最後買進日當天才補上金額（2000 股、每股 0.54 元）_併成一則最後買進日並寫出金額，除息日不再寄配息公布", async () => {
    await holding(2000, { symbol: "00919", name: "群益台灣精選高息" });

    await sendDividendNotices(runAt("2026-10-27"), exchanges([twse("2026-10-30", "00919", "")]).impl);
    for (const day of ["2026-10-29", "2026-10-30"]) await sendDividendNotices(runAt(day), exchanges([twse("2026-10-30", "00919", "0.540000")]).impl);

    expect(await titles()).toEqual(["00919 群益台灣精選高息 10/30 除息：配息金額還沒公布", "今天是最後買進日：00919 群益台灣精選高息 10/30 除息，每股配息 0.54 元，估計 $1,080"]);
  });

  it("只有除權（配股，也可能是現金增資）_寫除權、不估金額；最後買進日照樣提醒", async () => {
    await holding(1000, { symbol: "2882", name: "國泰金" });
    const feed = exchanges([twse("2026-11-06", "2882", "0", "權")]).impl;

    await sendDividendNotices(runAt("2026-10-29"), feed);
    await sendDividendNotices(runAt("2026-11-05"), feed);

    expect(await titles()).toEqual(["2882 國泰金 11/6 除權", "今天是最後買進日：2882 國泰金 11/6 除權"]);
  });

  it("同一天寄好幾則（11/18、10/30、11/4 除息）_除息日最近的最後寫入，通知新的在上面時最急的排最上面", async () => {
    const account = await insertAccount({ name: "元大證券" });
    await insertHolding({ accountId: account.id, shares: 1000 });
    await insertHolding({ accountId: account.id, symbol: "00919", name: "群益台灣精選高息", shares: 1000 });
    await insertHolding({ accountId: account.id, symbol: "0056", name: "元大高股息", shares: 1000 });

    await sendDividendNotices(runAt("2026-10-29"), exchanges([twse("2026-11-18", "006208", "1.720000"), twse("2026-10-30", "00919", "0.540000"), twse("2026-11-04", "0056", "")]).impl);

    expect(await titles()).toEqual([
      "006208 富邦台50 11/18 除息：每股配息 1.72 元，估計 $1,720",
      "0056 元大高股息 11/4 除息：配息金額還沒公布",
      "今天是最後買進日：00919 群益台灣精選高息 10/30 除息，每股配息 0.54 元，估計 $540",
    ]);
  });
});

describe("收件人與股數", () => {
  it("兩個人都持有 006208_各自只收到自己的，金額照自己的股數估（1000 股 $1,720、300 股 $516）", async () => {
    await holding(1000);
    const theirs = await insertAccount({ name: "富邦證券", userId: other });
    await insertHolding({ userId: other, accountId: theirs.id, shares: 300 });

    await sendDividendNotices(runAt("2026-10-29"), exchanges([twse("2026-11-18", "006208", "1.720000")]).impl);

    const sent = await notices();
    expect(sent).toHaveLength(2);
    expect(Object.fromEntries(sent.map((notice) => [notice.userId, notice.title]))).toEqual({
      [me]: "006208 富邦台50 11/18 除息：每股配息 1.72 元，估計 $1,720",
      [other]: "006208 富邦台50 11/18 除息：每股配息 1.72 元，估計 $516",
    });
  });

  it("同一檔分在兩個證券帳戶（600 + 400 股）_合成一則、估計 $1,720；股數 0 的持股不寄", async () => {
    const yuanta = await insertAccount({ name: "元大證券" });
    const fubon = await insertAccount({ name: "富邦證券" });
    await insertHolding({ accountId: yuanta.id, shares: 600 });
    await insertHolding({ accountId: fubon.id, shares: 400 });
    await insertHolding({ accountId: fubon.id, symbol: "0056", name: "元大高股息", shares: 0 });

    await sendDividendNotices(runAt("2026-10-29"), exchanges([twse("2026-11-18", "006208", "1.720000"), twse("2026-11-18", "0056", "1.000000")]).impl);

    expect(await titles()).toEqual(["006208 富邦台50 11/18 除息：每股配息 1.72 元，估計 $1,720"]);
  });

  it("停用的證券帳戶裡的股數不算（啟用的 400 股、停用的 600 股，估計 $688）", async () => {
    const active = await insertAccount({ name: "元大證券" });
    const closed = await insertAccount({ name: "舊的證券", active: false });
    await insertHolding({ accountId: active.id, shares: 400 });
    await insertHolding({ accountId: closed.id, shares: 600 });

    await sendDividendNotices(runAt("2026-10-29"), exchanges([twse("2026-11-18", "006208", "1.720000")]).impl);

    expect(await titles()).toEqual(["006208 富邦台50 11/18 除息：每股配息 1.72 元，估計 $688"]);
  });

  it("停用的使用者凍結：不讀預告、不寄、也不記下寄過；恢復後照常寄", async () => {
    const theirs = await insertAccount({ name: "富邦證券", userId: other });
    await insertHolding({ userId: other, accountId: theirs.id, shares: 1000 });
    await getDb().update(coreUsers).set({ disabledAt: new Date() }).where(eq(coreUsers.id, other));
    const feed = exchanges([twse("2026-11-18", "006208", "1.720000")]);

    expect(await sendDividendNotices(runAt("2026-10-29"), feed.impl)).toBe("沒有持股，不讀除權息預告");
    expect(feed.urls).toEqual([]);
    expect(await sentRows()).toEqual([]);

    await getDb().update(coreUsers).set({ disabledAt: null }).where(eq(coreUsers.id, other));
    await sendDividendNotices(runAt("2026-10-29"), feed.impl);

    expect(await notices()).toEqual([{ userId: other, module: "savings", kind: "dividend_announced", title: "006208 富邦台50 11/18 除息：每股配息 1.72 元，估計 $1,720", url: "/savings/investments" }]);
  });

  it("沒有任何持股（證券帳戶是空的）_不讀預告表", async () => {
    await insertAccount({ name: "元大證券" });
    const feed = exchanges([twse("2026-11-18", "006208", "1.720000")]);

    expect(await sendDividendNotices(runAt("2026-10-29"), feed.impl)).toBe("沒有持股，不讀除權息預告");
    expect(feed.urls).toEqual([]);
  });
});

describe("過期的紀錄與讀不到的來源", () => {
  it("除息日過了的紀錄刪掉（今天除息的留著）；預告表裡已經過去的除息日不寄", async () => {
    await holding(1000);
    await getDb()
      .insert(savingsDividendNotices)
      .values([
        { userId: me, symbol: "006208", exDate: "2026-10-28" },
        { userId: me, symbol: "006208", exDate: "2026-10-29" },
      ]);

    await sendDividendNotices(runAt("2026-10-29"), exchanges([twse("2026-10-22", "006208", "1.720000"), twse("2026-10-28", "006208", "1.000000")]).impl);

    expect(await notices()).toEqual([]);
    expect((await sentRows()).map((row) => row.exDate)).toEqual(["2026-10-29"]);
  });

  it("證交所讀不到（500）_櫃買中心的照常寄；摘要只寫數字，不寫代號與名稱", async () => {
    captureErrorLog();
    await holding(1000, { symbol: "00679B", name: "元大美債20年" });

    const summary = await sendDividendNotices(runAt("2026-10-29"), exchanges(500, [tpex("2026-11-10", "00679B", "0.38000000")]).impl);

    expect(summary).toBe("寄出 1 則除權息通知，1 個來源讀不到");
    expect(await titles()).toEqual(["00679B 元大美債20年 11/10 除息：每股配息 0.38 元，估計 $380"]);
  });

  it("兩個都讀不到_今天略過、不寄", async () => {
    captureErrorLog();
    await holding(1000);

    expect(await sendDividendNotices(runAt("2026-10-29"), exchanges(500, 503).impl)).toBe("讀不到除權息預告，今天略過");
    expect(await notices()).toEqual([]);
  });
});

describe("認領：同一則只寄一次，寄不出去就放掉", () => {
  it("寄不出去_放掉認領（新的那一列刪掉、補上金額的記號改回），下一次排程再寄；log 不記錯誤原文", async () => {
    const log = captureErrorLog();
    await holding(1000);
    const before = exchanges([twse("2026-11-18", "006208", "")]).impl;
    const announced = exchanges([twse("2026-11-18", "006208", "1.720000")]).impl;

    notify.mockRejectedValueOnce(new Error("connection reset: secret-detail"));
    expect(await sendDividendNotices(runAt("2026-10-29"), before)).toBe("1 則寄不出去（詳見伺服器 log）");
    expect(await sentRows()).toEqual([]);
    expect(await sendDividendNotices(runAt("2026-10-29"), before)).toBe("寄出 1 則除權息通知");

    notify.mockRejectedValueOnce(new Error("connection reset: secret-detail"));
    await sendDividendNotices(runAt("2026-11-02"), announced);
    expect(await sentRows()).toEqual([{ symbol: "006208", exDate: "2026-11-18", amountNotified: false, reminded: false }]);
    await sendDividendNotices(runAt("2026-11-02"), announced);

    expect(await titles()).toEqual(["006208 富邦台50 11/18 除息：配息金額還沒公布", "006208 富邦台50 配息公布：每股配息 1.72 元，估計 $1,720（11/18 除息）"]);
    expect(loggedText(log)).not.toContain("secret-detail");
  });

  it("同一天同時跑兩次（重送的排程）_公布與補上金額都只寄一則", async () => {
    await holding(1000);
    const before = exchanges([twse("2026-11-18", "006208", "")]).impl;
    const announced = exchanges([twse("2026-11-18", "006208", "1.720000")]).impl;

    await Promise.all([sendDividendNotices(runAt("2026-10-29"), before), sendDividendNotices(runAt("2026-10-29"), before)]);
    await Promise.all([sendDividendNotices(runAt("2026-11-02"), announced), sendDividendNotices(runAt("2026-11-02"), announced)]);

    expect(await titles()).toEqual(["006208 富邦台50 11/18 除息：配息金額還沒公布", "006208 富邦台50 配息公布：每股配息 1.72 元，估計 $1,720（11/18 除息）"]);
    expect(await sentRows()).toHaveLength(1);
  });
});
