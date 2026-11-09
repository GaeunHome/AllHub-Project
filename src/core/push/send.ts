import "server-only";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { generateRequestDetails } from "web-push";
import { db } from "../db";
import { corePushMutes, corePushSubscriptions } from "../db/schema";
import { pushKeys, type PushKeys } from "../env";
import { logError } from "../errors";
import { HttpStatusError, externalFetch } from "../external-url";

export type PushMessage = { title: string; body: string; url: string | null };
export type PushTarget = { id: number; userId: string };

const CONCURRENCY = 4;
// webhook 與排程都在等 一支手機最多等這麼久
const TIMEOUT_MS = 5000;
// 手機關機時推送服務留著 超過一天的通知就不用補了
const TTL_SECONDS = 86_400;
const BODY_MAX = 300;

type Device = { endpoint: string; userId: string; p256dh: string; auth: string };

/** 回傳手機已經不在的 endpoint 其他錯誤只記 log log 不記網址 網址就是這支手機的憑證 */
async function sendTo(device: Device, target: PushTarget, message: PushMessage, keys: PushKeys): Promise<string | null> {
  try {
    const payload = JSON.stringify({ id: target.id, title: message.title, body: message.body.slice(0, BODY_MAX), url: message.url });
    const { endpoint, headers, body } = generateRequestDetails({ endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } }, payload, { vapidDetails: keys, TTL: TTL_SECONDS });
    const response = await externalFetch(endpoint, { method: "POST", headers: headers as Record<string, string>, body: body && new Uint8Array(body) }, { timeoutMs: TIMEOUT_MS });
    if (response.status === 404 || response.status === 410) return device.endpoint;
    if (!response.ok) logError("push", "推送服務拒絕", new HttpStatusError(response.status));
  } catch (error) {
    logError("push", "推播失敗", error);
  }
  return null;
}

/** 依序跑 同時最多幾個 手機再多也不會一次全送 */
async function eachLimited<T>(items: readonly T[], work: (item: T) => Promise<void>): Promise<void> {
  const queue = [...items];
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) await work(item);
  }));
}

/**
 * 不能丟錯 sendOnce 會放掉認領 站內通知會重寄
 * 收件人已由 notify 濾掉停用與沒權限的人
 */
export async function pushToPhones(targets: readonly PushTarget[], module: string, message: PushMessage): Promise<void> {
  try {
    const keys = pushKeys();
    if (!keys || targets.length === 0) return;
    const devices = await db()
      .select({ endpoint: corePushSubscriptions.endpoint, userId: corePushSubscriptions.userId, p256dh: corePushSubscriptions.p256dh, auth: corePushSubscriptions.auth })
      .from(corePushSubscriptions)
      .leftJoin(corePushMutes, and(eq(corePushMutes.endpoint, corePushSubscriptions.endpoint), eq(corePushMutes.moduleId, module)))
      .where(and(inArray(corePushSubscriptions.userId, targets.map(({ userId }) => userId)), isNull(corePushMutes.endpoint)));
    const targetOf = new Map(targets.map((target) => [target.userId, target]));
    const gone: string[] = [];
    await eachLimited(devices, async (device) => {
      const endpoint = await sendTo(device, targetOf.get(device.userId)!, message, keys);
      if (endpoint) gone.push(endpoint);
    });
    if (gone.length > 0) await db().delete(corePushSubscriptions).where(inArray(corePushSubscriptions.endpoint, gone));
  } catch (error) {
    logError("push", "推播失敗", error);
  }
}
