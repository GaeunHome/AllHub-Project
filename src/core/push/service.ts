import "server-only";
import { and, asc, count, eq, ne } from "drizzle-orm";
import { db } from "../db";
import { corePushMutes, corePushSubscriptions } from "../db/schema";
import { lockUserRow } from "../db/users";
import { PUSH_DEVICE_LIMIT } from "./rules";

// userId 一律是登入者 endpoint 是這支手機 所有寫入都同時比對兩個

export type PushDevice = { endpoint: string; p256dh: string; auth: string };

const mine = (userId: string, endpoint: string) => and(eq(corePushSubscriptions.endpoint, endpoint), eq(corePushSubscriptions.userId, userId));

/** 同一支手機換人登入時改成目前的人 前一個人的開關不留著 超過上限換掉最舊的 弄丟的手機才不會卡住新手機 */
export async function saveSubscription(userId: string, device: PushDevice): Promise<{ muted: string[] }> {
  return db().transaction(async (tx) => {
    await lockUserRow(tx, userId, "no key update");
    await tx.delete(corePushSubscriptions).where(and(eq(corePushSubscriptions.endpoint, device.endpoint), ne(corePushSubscriptions.userId, userId)));
    await tx
      .insert(corePushSubscriptions)
      .values({ ...device, userId })
      .onConflictDoUpdate({ target: corePushSubscriptions.endpoint, set: { p256dh: device.p256dh, auth: device.auth } });
    const [{ devices }] = await tx.select({ devices: count() }).from(corePushSubscriptions).where(eq(corePushSubscriptions.userId, userId));
    if (devices > PUSH_DEVICE_LIMIT) {
      const [oldest] = await tx
        .select({ endpoint: corePushSubscriptions.endpoint })
        .from(corePushSubscriptions)
        .where(and(eq(corePushSubscriptions.userId, userId), ne(corePushSubscriptions.endpoint, device.endpoint)))
        .orderBy(asc(corePushSubscriptions.createdAt), asc(corePushSubscriptions.endpoint))
        .limit(1);
      await tx.delete(corePushSubscriptions).where(eq(corePushSubscriptions.endpoint, oldest.endpoint));
    }
    const muted = await tx.select({ moduleId: corePushMutes.moduleId }).from(corePushMutes).where(eq(corePushMutes.endpoint, device.endpoint));
    return { muted: muted.map(({ moduleId }) => moduleId) };
  });
}

export async function removeSubscription(userId: string, endpoint: string): Promise<void> {
  await db().delete(corePushSubscriptions).where(mine(userId, endpoint));
}

/** 別人的手機回 false */
export async function setPushMute(userId: string, endpoint: string, moduleId: string, muted: boolean): Promise<boolean> {
  return db().transaction(async (tx) => {
    const [device] = await tx.select({ endpoint: corePushSubscriptions.endpoint }).from(corePushSubscriptions).where(mine(userId, endpoint)).for("key share");
    if (!device) return false;
    if (muted) await tx.insert(corePushMutes).values({ endpoint, moduleId }).onConflictDoNothing();
    else await tx.delete(corePushMutes).where(and(eq(corePushMutes.endpoint, endpoint), eq(corePushMutes.moduleId, moduleId)));
    return true;
  });
}

/** 改密碼時其他裝置跟舊的登入一起失效 keep 是這支手機 在電腦上改的是 null */
export async function removeOtherSubscriptions(userId: string, keep: string | null): Promise<void> {
  await db()
    .delete(corePushSubscriptions)
    .where(and(eq(corePushSubscriptions.userId, userId), keep ? ne(corePushSubscriptions.endpoint, keep) : undefined));
}
