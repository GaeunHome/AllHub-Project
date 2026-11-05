import "server-only";
import { and, asc, count, desc, eq, exists, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { coreUsers } from "@/core/db/schema";
import { db } from "@/core/db";
import { lockUserRow, userAvatar } from "@/core/db/users";
import { taipeiDateKey } from "@/core/time";
import { travelChecks, travelComments, travelItems, travelMembers, travelTrips } from "../data/schema";
import { MEMBER_LIMIT, RETENTION_DAYS, TRIP_LIMIT, addDays, parseTrip } from "../lib/rules";
import { assertManager, inMemberTrip, isMemberOf, managerOf } from "./access";
import { TravelUserError, TripNotFoundError } from "./errors";
import { isJoinToken, joinPath } from "./join-link";

// userId 一律是登入者 網址與表單送來的 id 只決定操作哪一趟

export type TripInput = { title: string; destination: string; startDate: string; endDate: string };
export type TripSummary = { id: number; title: string; destination: string | null; startDate: string; endDate: string; memberCount: number };
export type TripMember = { id: string; username: string; name: string; avatar: string | null };
export type TripItem = Omit<typeof travelItems.$inferSelect, "createdAt" | "updatedAt">;
export type TripComment = { id: number; itemId: number; userId: string; authorName: string; body: string; createdAt: Date };
export type TripCheck = { id: number; title: string; done: boolean };
export type TripDetail = TripSummary & { members: TripMember[]; managerId: string | null; items: TripItem[]; comments: TripComment[]; checks: TripCheck[]; joinPath: string | null };

/** 暱稱優先 service 不 import 登入 所以寫在 SQL 裡 */
const displayName = sql<string>`coalesce(${coreUsers.nickname}, ${coreUsers.username})`;

const SUMMARY_COLUMNS = { id: travelTrips.id, title: travelTrips.title, destination: travelTrips.destination, startDate: travelTrips.startDate, endDate: travelTrips.endDate };

function parsed(input: TripInput) {
  const result = parseTrip(input);
  if (!result.ok) throw new TravelUserError(result.error);
  return result.value;
}

export async function listTrips(userId: string): Promise<TripSummary[]> {
  const trips = await db().select(SUMMARY_COLUMNS).from(travelTrips).where(isMemberOf(userId)).orderBy(asc(travelTrips.startDate), asc(travelTrips.id));
  if (trips.length === 0) return [];
  const counts = await db()
    .select({ tripId: travelMembers.tripId, members: count() })
    .from(travelMembers)
    .where(
      inArray(
        travelMembers.tripId,
        trips.map((trip) => trip.id),
      ),
    )
    .groupBy(travelMembers.tripId);
  const members = new Map(counts.map((row) => [row.tripId, row.members]));
  return trips.map((trip) => ({ ...trip, memberCount: members.get(trip.id) ?? 1 }));
}

/** 不是成員回 null 頁面當作不存在 連結只給建立的人 其他人看不到 */
export async function tripDetail(userId: string, tripId: number): Promise<TripDetail | null> {
  const [trip] = await db()
    .select()
    .from(travelTrips)
    .where(and(eq(travelTrips.id, tripId), isMemberOf(userId)));
  if (!trip) return null;
  const [members, items, comments, checks, managerId] = await Promise.all([
    db().select({ id: coreUsers.id, username: coreUsers.username, name: displayName, avatar: userAvatar }).from(travelMembers).innerJoin(coreUsers, eq(travelMembers.userId, coreUsers.id)).where(eq(travelMembers.tripId, tripId)).orderBy(asc(travelMembers.joinedAt), asc(travelMembers.userId)),
    db()
      .select({
        id: travelItems.id,
        tripId: travelItems.tripId,
        day: travelItems.day,
        position: travelItems.position,
        kind: travelItems.kind,
        title: travelItems.title,
        mapsUrl: travelItems.mapsUrl,
        lat: travelItems.lat,
        lng: travelItems.lng,
        note: travelItems.note,
        stayMinutes: travelItems.stayMinutes,
        travelMinutes: travelItems.travelMinutes,
        fixedTime: travelItems.fixedTime,
        version: travelItems.version,
      })
      .from(travelItems)
      .where(eq(travelItems.tripId, tripId))
      .orderBy(asc(travelItems.position), asc(travelItems.id)),
    db()
      .select({ id: travelComments.id, itemId: travelComments.itemId, userId: travelComments.userId, authorName: displayName, body: travelComments.body, createdAt: travelComments.createdAt })
      .from(travelComments)
      .innerJoin(travelItems, eq(travelComments.itemId, travelItems.id))
      .innerJoin(coreUsers, eq(travelComments.userId, coreUsers.id))
      .where(eq(travelItems.tripId, tripId))
      .orderBy(asc(travelComments.createdAt), asc(travelComments.id)),
    db().select({ id: travelChecks.id, title: travelChecks.title, done: travelChecks.done }).from(travelChecks).where(eq(travelChecks.tripId, tripId)).orderBy(asc(travelChecks.id)),
    managerOf(db(), tripId),
  ]);
  const canShare = managerId === userId && trip.joinOpen;
  return {
    id: trip.id,
    title: trip.title,
    destination: trip.destination,
    startDate: trip.startDate,
    endDate: trip.endDate,
    memberCount: members.length,
    members,
    managerId,
    items,
    comments,
    checks,
    joinPath: canShare ? joinPath(trip.id, trip.joinGeneration) : null,
  };
}

export async function createTrip(userId: string, input: TripInput): Promise<{ id: number; title: string }> {
  const values = parsed(input);
  return db().transaction(async (tx) => {
    // 先鎖使用者再數 同時新增時才不會超過上限
    await lockUserRow(tx, userId, "no key update");
    const [{ trips }] = await tx.select({ trips: count() }).from(travelMembers).where(eq(travelMembers.userId, userId));
    if (trips >= TRIP_LIMIT) throw new TravelUserError(`旅程已滿 ${TRIP_LIMIT} 趟，請先刪除一趟`);
    const [trip] = await tx.insert(travelTrips).values(values).returning({ id: travelTrips.id, title: travelTrips.title });
    await tx.insert(travelMembers).values({ tripId: trip.id, userId });
    return trip;
  });
}

/** 日期改短時 排在被拿掉那幾天的項目回到想去的點 不直接刪 */
export async function updateTrip(userId: string, tripId: number, input: TripInput): Promise<{ title: string }> {
  const values = parsed(input);
  return inMemberTrip(userId, tripId, async (tx) => {
    await tx.update(travelTrips).set({ ...values, updatedAt: sql`now()` }).where(eq(travelTrips.id, tripId));
    await tx
      .update(travelItems)
      .set({ day: null })
      .where(and(eq(travelItems.tripId, tripId), isNotNull(travelItems.day), sql`(${travelItems.day} < ${values.startDate} or ${travelItems.day} > ${values.endDate})`));
    return { title: values.title };
  });
}

export async function deleteTrip(userId: string, tripId: number): Promise<{ title: string }> {
  return inMemberTrip(userId, tripId, async (tx, trip) => {
    await assertManager(tx, tripId, userId);
    await tx.delete(travelTrips).where(eq(travelTrips.id, tripId));
    return { title: trip.title };
  });
}

/** 最後一個人離開時旅程沒有人看得到 一起刪掉 */
export async function leaveTrip(userId: string, tripId: number): Promise<{ title: string }> {
  return inMemberTrip(userId, tripId, async (tx, trip) => {
    await tx.delete(travelMembers).where(and(eq(travelMembers.tripId, tripId), eq(travelMembers.userId, userId)));
    const [{ left }] = await tx.select({ left: count() }).from(travelMembers).where(eq(travelMembers.tripId, tripId));
    if (left === 0) await tx.delete(travelTrips).where(eq(travelTrips.id, tripId));
    return { title: trip.title };
  });
}

export async function removeMember(userId: string, tripId: number, memberId: string): Promise<void> {
  await inMemberTrip(userId, tripId, async (tx) => {
    await assertManager(tx, tripId, userId);
    if (memberId === userId) throw new TravelUserError("要離開請用「離開旅程」");
    await tx.delete(travelMembers).where(and(eq(travelMembers.tripId, tripId), eq(travelMembers.userId, memberId)));
  });
}

/** 打開就能分享 撤銷時換一代 舊的連結再也不能用 */
export async function setJoinLink(userId: string, tripId: number, open: boolean): Promise<void> {
  await inMemberTrip(userId, tripId, async (tx) => {
    await assertManager(tx, tripId, userId);
    await tx
      .update(travelTrips)
      .set({ joinOpen: open, ...(open ? {} : { joinGeneration: sql`${travelTrips.joinGeneration} + 1` }) })
      .where(eq(travelTrips.id, tripId));
  });
}

export type JoinPreview = Pick<TripSummary, "title" | "destination" | "startDate" | "endDate"> & { alreadyMember: boolean };

/** 連結不對 撤銷了或旅程不在都回 null 看不出是哪一種 */
export async function joinPreview(userId: string, tripId: number, token: string): Promise<JoinPreview | null> {
  const [trip] = await db().select().from(travelTrips).where(eq(travelTrips.id, tripId));
  if (!trip?.joinOpen || !isJoinToken(tripId, trip.joinGeneration, token)) return null;
  const [member] = await db()
    .select({ userId: travelMembers.userId })
    .from(travelMembers)
    .where(and(eq(travelMembers.tripId, tripId), eq(travelMembers.userId, userId)));
  return { title: trip.title, destination: trip.destination, startDate: trip.startDate, endDate: trip.endDate, alreadyMember: Boolean(member) };
}

export async function joinTrip(userId: string, tripId: number, token: string): Promise<{ title: string }> {
  return db().transaction(async (tx) => {
    const [trip] = await tx.select().from(travelTrips).where(eq(travelTrips.id, tripId)).for("update");
    if (!trip?.joinOpen || !isJoinToken(tripId, trip.joinGeneration, token)) throw new TripNotFoundError();
    const [{ members }] = await tx.select({ members: count() }).from(travelMembers).where(eq(travelMembers.tripId, tripId));
    if (members >= MEMBER_LIMIT) throw new TravelUserError(`這趟旅程已滿 ${MEMBER_LIMIT} 人`);
    await tx.insert(travelMembers).values({ tripId, userId }).onConflictDoNothing();
    return { title: trip.title };
  });
}

/** 使用者要的 回程 7 天後刪掉 沒有成員的也刪 帳號都刪掉的人留下的 */
export async function cleanupTrips(now = new Date()): Promise<string> {
  const cutoff = addDays(taipeiDateKey(now), -RETENTION_DAYS);
  const expired = await db().delete(travelTrips).where(lt(travelTrips.endDate, cutoff)).returning({ id: travelTrips.id });
  const orphaned = await db()
    .delete(travelTrips)
    .where(sql`not exists (select 1 from ${travelMembers} where ${travelMembers.tripId} = ${travelTrips.id})`)
    .returning({ id: travelTrips.id });
  return `刪除 ${expired.length} 趟結束超過 ${RETENTION_DAYS} 天的旅程、${orphaned.length} 趟沒有成員的旅程`;
}

/** 首頁卡片用 今天有排項目的那一趟 想去的點還沒有日期 不算 */
export async function todayTrip(userId: string, today: string): Promise<TripSummary | null> {
  const scheduledToday = db()
    .select({ id: travelItems.id })
    .from(travelItems)
    .where(and(eq(travelItems.tripId, travelTrips.id), eq(travelItems.day, today)));
  const [trip] = await db()
    .select(SUMMARY_COLUMNS)
    .from(travelTrips)
    .where(and(isMemberOf(userId), exists(scheduledToday)))
    .orderBy(asc(travelTrips.startDate), desc(travelTrips.id))
    .limit(1);
  return trip ? { ...trip, memberCount: 0 } : null;
}
