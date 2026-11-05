import { describe, expect, it } from "vitest";
import { setupTestDb } from "@/dev/test-db";
import { stubCoreEnv } from "@/dev/test-env";
import { coreCronStatus, coreServiceStatus } from "../db/schema";

stubCoreEnv();
const { listStatus, recordCronRun, reportService, trackService } = await import("../status");

const getDb = setupTestDb();
const AT = new Date("2026-11-05T05:20:00Z");
const LATER = new Date("2026-11-06T05:20:00Z");
const run = { task: "starrail:warps", startedAt: AT, durationMs: 1200, ok: true, summary: "同步 2 個帳號，新增 3 抽" };

describe("排程紀錄（使用者要的：只更新不新增，資料量不會長大）", () => {
  it("同一個排程跑很多次還是一列，留最後一次的結果", async () => {
    await recordCronRun(run);
    await recordCronRun({ ...run, startedAt: LATER, ok: false, summary: "失敗：TypeError" });

    const rows = await getDb().select().from(coreCronStatus);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ task: "starrail:warps", lastRunAt: LATER, ok: false, summary: "失敗：TypeError" });
  });

  it("不同排程各一列", async () => {
    await recordCronRun(run);
    await recordCronRun({ ...run, task: "weather:rain" });

    expect(await getDb().select().from(coreCronStatus)).toHaveLength(2);
  });
});

describe("外部服務的狀態", () => {
  it("同一個服務不管回報幾次都是一列", async () => {
    await reportService("starrail:warps", "-100：authkey error", AT);
    await reportService("starrail:warps", null, LATER);
    await reportService("starrail:warps", "又壞了", LATER);

    expect(await getDb().select().from(coreServiceStatus)).toHaveLength(1);
  });

  it("恢復正常時留著上一次的錯誤 站長才看得到剛才壞過什麼", async () => {
    await reportService("starrail:warps", "-100：authkey error", AT);
    await reportService("starrail:warps", null, LATER);

    expect((await listStatus()).services).toEqual([{ service: "starrail:warps", lastOkAt: LATER, lastErrorAt: AT, lastError: "-100：authkey error" }]);
  });

  it("trackService：成功算正常 回傳原本的結果", async () => {
    expect(await trackService("twitch:eventsub", async () => "同步完成")).toBe("同步完成");

    expect((await listStatus()).services[0]).toMatchObject({ service: "twitch:eventsub", lastError: null });
  });

  it("trackService：丟錯時只記錯誤種類 錯誤照樣丟出去 訊息可能夾帶憑證", async () => {
    const boom = new TypeError("Cookie: ltoken_v2=v2_top_secret");

    await expect(trackService("twitch:eventsub", () => Promise.reject(boom))).rejects.toBe(boom);

    const [row] = (await listStatus()).services;
    expect(row.lastError).toContain("TypeError");
    expect(row.lastError).not.toContain("top_secret");
  });
});
