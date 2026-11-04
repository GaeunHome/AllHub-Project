import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { db, type Executor } from "@/core/db";
import { travelMembers, travelTrips } from "../data/schema";
import { TravelUserError, TripNotFoundError } from "./errors";

export type Trip = typeof travelTrips.$inferSelect;
type Transaction = Parameters<Parameters<ReturnType<typeof db>["transaction"]>[0]>[0];

/** 旅程的每個讀寫都用這個條件 不是成員就查不到 */
export const isMemberOf = (userId: string) => sql`exists (select 1 from ${travelMembers} where ${travelMembers.tripId} = ${travelTrips.id} and ${travelMembers.userId} = ${userId})`;

/**
 * 同一趟旅程的寫入一個一個來 先鎖旅程再比對成員
 * 成員同時改順序或新增時位置才不會打架 不是成員的當作不存在
 */
export async function inMemberTrip<T>(userId: string, tripId: number, work: (tx: Transaction, trip: Trip) => Promise<T>): Promise<T> {
  return db().transaction(async (tx) => {
    const [trip] = await tx
      .select()
      .from(travelTrips)
      .where(and(eq(travelTrips.id, tripId), isMemberOf(userId)))
      .for("update");
    if (!trip) throw new TripNotFoundError();
    return work(tx, trip);
  });
}

/** 最早加入的人管理成員與連結 建立的人離開後自動交給下一位 */
export async function managerOf(executor: Executor, tripId: number): Promise<string | null> {
  const [row] = await executor.select({ userId: travelMembers.userId }).from(travelMembers).where(eq(travelMembers.tripId, tripId)).orderBy(asc(travelMembers.joinedAt), asc(travelMembers.userId)).limit(1);
  return row?.userId ?? null;
}

export async function assertManager(executor: Executor, tripId: number, userId: string): Promise<void> {
  if ((await managerOf(executor, tripId)) !== userId) throw new TravelUserError("只有建立旅程的人可以這樣做");
}
