import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeFetch } from "@/dev/fake-fetch";
import { setupTestDb, type TestDb } from "@/dev/test-db";
import { stubYoutubeEnv } from "@/dev/test-env";
import { youtubeChannels } from "../data/schema";
import { hubRequest } from "../lib/api";
import { parseVerification, topicFor } from "../lib/websub";
import { handleVerification } from "./channels";

// 從送給 hub 的訂閱請求一路走到 hub 回呼確認：只把 fetch 換成假 hub，hubRequest、parseVerification、handleVerification 與資料庫都是真的

stubYoutubeEnv();

const CH = "UC" + "a".repeat(22);
const OTHER = "UC" + "b".repeat(22);
const CALLBACK = "https://hub.example.com/api/youtube/websub";
const NOW = new Date("2026-10-07T12:00:00Z");
const DAY_MS = 24 * 3600_000;

let testDb: TestDb;
setupTestDb((d) => (testDb = d));

/** 假 hub：記下收到的訂閱請求 */
let hub = fakeFetch(() => new Response(null, { status: 202 }));
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  hub = fakeFetch(() => new Response(null, { status: 202 }));
  vi.stubGlobal("fetch", hub.impl);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function callbackFor(mode: "subscribe" | "unsubscribe", channelId: string): Promise<string> {
  await hubRequest(mode, channelId);
  return new URLSearchParams(String(hub.calls.at(-1)!.init.body)).get("hub.callback")!;
}

/** hub 照 WebSub 規範在 callback 上「加上」hub.* 參數再 GET；callback 原本的 query 會保留 */
async function hubVerifies(callback: string, params: Record<string, string>): Promise<string | null> {
  const url = new URL(callback);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  const verification = parseVerification(url.searchParams);
  return verification ? handleVerification(verification) : null;
}

const insertChannel = (channelId = CH) => testDb.insert(youtubeChannels).values({ channelId, title: "뉴진스", subscriptionStatus: "pending" });
const channelRow = async (channelId = CH) => (await testDb.select().from(youtubeChannels).where(eq(youtubeChannels.channelId, channelId)))[0];
const subscribeParams = (channelId: string, lease = "432000") => ({
  "hub.mode": "subscribe",
  "hub.topic": topicFor(channelId),
  "hub.challenge": "challenge-1",
  "hub.lease_seconds": lease,
});

describe("WebSub callback 驗證", () => {
  it("送給 hub 的 callback 帶頻道專屬的 k；hub 用它來確認_回 challenge、記錄租約", async () => {
    await insertChannel();
    const callback = await callbackFor("subscribe", CH);

    const url = new URL(callback);
    expect(`${url.origin}${url.pathname}`).toBe(CALLBACK);
    expect(url.searchParams.get("k")).toMatch(/^[0-9a-f]{64}$/);
    expect(await hubVerifies(callback, subscribeParams(CH))).toBe("challenge-1");
    const row = await channelRow();
    expect(row.subscriptionStatus).toBe("subscribed");
    expect(row.leaseExpiresAt?.getTime()).toBe(NOW.getTime() + 432000_000);
  });

  it("沒有 k 或 k 不對（直接偽造、或別人用自己的 secret 向 hub 代訂我們的 callback）_拒絕且不改狀態", async () => {
    await insertChannel();

    expect(await hubVerifies(CALLBACK, subscribeParams(CH, "1000000000"))).toBeNull();
    expect(await hubVerifies(`${CALLBACK}?k=${"0".repeat(64)}`, subscribeParams(CH, "1000000000"))).toBeNull();

    const row = await channelRow();
    expect(row.subscriptionStatus).toBe("pending");
    expect(row.leaseExpiresAt).toBeNull();
  });

  it("別的頻道的 k 不能拿來確認這個頻道", async () => {
    await insertChannel();
    await insertChannel(OTHER);
    const otherCallback = await callbackFor("subscribe", OTHER);

    expect(await hubVerifies(otherCallback, subscribeParams(CH))).toBeNull();
    expect((await channelRow()).subscriptionStatus).toBe("pending");
  });

  it("租約超過上限_只記 10 天，續訂排程照常會觸發", async () => {
    await insertChannel();
    const callback = await callbackFor("subscribe", CH);

    expect(await hubVerifies(callback, subscribeParams(CH, "1000000000"))).toBe("challenge-1");

    expect((await channelRow()).leaseExpiresAt?.getTime()).toBe(NOW.getTime() + 10 * DAY_MS);
  });

  it("租約大到超出 Date 範圍也不會出錯", async () => {
    await insertChannel();
    const callback = await callbackFor("subscribe", CH);

    await expect(hubVerifies(callback, subscribeParams(CH, "9".repeat(30)))).resolves.toBe("challenge-1");
    expect((await channelRow()).leaseExpiresAt?.getTime()).toBe(NOW.getTime() + 10 * DAY_MS);
  });

  it("denied 也要帶 k；reason 截短後才寫進狀態", async () => {
    await insertChannel();
    const callback = await callbackFor("subscribe", CH);
    const denied = (reason: string) => ({ "hub.mode": "denied", "hub.topic": topicFor(CH), "hub.reason": reason });

    await hubVerifies(CALLBACK, denied("forged"));
    expect((await channelRow()).subscriptionStatus).toBe("pending");

    await hubVerifies(callback, denied("拒".repeat(5000)));
    const status = (await channelRow()).subscriptionStatus!;
    expect(status).toBe(`訂閱失敗：hub 拒絕（${"拒".repeat(200)}）`);
  });

  it("退訂確認也要帶 k：已刪除的頻道用我們的 callback 確認_通過；沒有 k_拒絕", async () => {
    const callback = await callbackFor("unsubscribe", CH);
    const unsubscribe = { "hub.mode": "unsubscribe", "hub.topic": topicFor(CH), "hub.challenge": "u1" };

    expect(await hubVerifies(callback, unsubscribe)).toBe("u1");
    expect(await hubVerifies(CALLBACK, unsubscribe)).toBeNull();
  });
});
