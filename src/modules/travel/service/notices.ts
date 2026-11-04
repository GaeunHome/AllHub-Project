import "server-only";
import { and, eq, ne } from "drizzle-orm";
import { claimKey, sendOnce } from "@/core/claim";
import { db } from "@/core/db";
import { notify } from "@/core/notify";
import { travelMembers, travelTrips } from "../data/schema";
import { tripHref } from "../lib/urls";

/** 十分鐘內同一個人改同一趟只通知一次 連續拖曳時才不會收到一長串 */
const QUIET_MS = 10 * 60_000;

/** 通知其他成員 這是別人知道行程變了的唯一管道 不另外輪詢 */
export async function announceTripChange({ tripId, actorId, actorName, joined = false, now = new Date() }: { tripId: number; actorId: string; actorName: string; joined?: boolean; now?: Date }): Promise<void> {
  const [trip] = await db().select({ title: travelTrips.title }).from(travelTrips).where(eq(travelTrips.id, tripId));
  if (!trip) return;
  const others = await db()
    .select({ userId: travelMembers.userId })
    .from(travelMembers)
    .where(and(eq(travelMembers.tripId, tripId), ne(travelMembers.userId, actorId)));
  if (others.length === 0) return;
  const key = claimKey(tripId, actorId, joined ? "joined" : Math.floor(now.getTime() / QUIET_MS));
  await sendOnce({ scope: "travel:edit", key, now, log: { module: "travel", what: "行程更新通知" } }, () =>
    notify({ recipients: others.map((row) => row.userId), module: "travel", kind: "edit", title: `${actorName} ${joined ? "加入了" : "改了"}「${trip.title}」`, url: tripHref(tripId) }),
  );
}
