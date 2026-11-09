import "server-only";
import { and, count, eq } from "drizzle-orm";
import { valueOrThrow } from "@/core/parsed";
import { travelChecks, travelComments, travelItems } from "../data/schema";
import { CHECK_LIMIT, CHECK_MAX, COMMENT_LIMIT, COMMENT_MAX, parseShortText } from "../lib/rules";
import { inMemberTrip, managerOf } from "./access";
import { TravelUserError } from "./errors";

// 留言與出發前清單 所有成員都能用

const text = (input: string, label: string, max: number): string => valueOrThrow(parseShortText(input, label, max), TravelUserError);

export async function addComment(userId: string, tripId: number, itemId: number, input: string): Promise<void> {
  const body = text(input, "留言", COMMENT_MAX);
  await inMemberTrip(userId, tripId, async (tx) => {
    const [item] = await tx
      .select({ id: travelItems.id })
      .from(travelItems)
      .where(and(eq(travelItems.id, itemId), eq(travelItems.tripId, tripId)));
    if (!item) throw new TravelUserError("找不到這一項，可能已經被刪除");
    const [{ comments }] = await tx.select({ comments: count() }).from(travelComments).where(eq(travelComments.itemId, itemId));
    if (comments >= COMMENT_LIMIT) throw new TravelUserError(`每一項最多 ${COMMENT_LIMIT} 則留言`);
    await tx.insert(travelComments).values({ itemId, userId, body });
  });
}

/** 自己的留言自己刪 建立旅程的人也能刪 */
export async function deleteComment(userId: string, tripId: number, commentId: number): Promise<void> {
  await inMemberTrip(userId, tripId, async (tx) => {
    const [comment] = await tx
      .select({ id: travelComments.id, userId: travelComments.userId })
      .from(travelComments)
      .innerJoin(travelItems, eq(travelComments.itemId, travelItems.id))
      .where(and(eq(travelComments.id, commentId), eq(travelItems.tripId, tripId)));
    if (!comment) throw new TravelUserError("找不到這則留言");
    if (comment.userId !== userId && (await managerOf(tx, tripId)) !== userId) throw new TravelUserError("只能刪除自己的留言");
    await tx.delete(travelComments).where(eq(travelComments.id, commentId));
  });
}

export async function addCheck(userId: string, tripId: number, input: string): Promise<void> {
  const title = text(input, "項目", CHECK_MAX);
  await inMemberTrip(userId, tripId, async (tx) => {
    const [{ checks }] = await tx.select({ checks: count() }).from(travelChecks).where(eq(travelChecks.tripId, tripId));
    if (checks >= CHECK_LIMIT) throw new TravelUserError(`清單最多 ${CHECK_LIMIT} 項`);
    await tx.insert(travelChecks).values({ tripId, title });
  });
}

export async function setCheckDone(userId: string, tripId: number, checkId: number, done: boolean): Promise<void> {
  await inMemberTrip(userId, tripId, async (tx) => {
    await tx
      .update(travelChecks)
      .set({ done })
      .where(and(eq(travelChecks.id, checkId), eq(travelChecks.tripId, tripId)));
  });
}

export async function deleteCheck(userId: string, tripId: number, checkId: number): Promise<void> {
  await inMemberTrip(userId, tripId, async (tx) => {
    await tx.delete(travelChecks).where(and(eq(travelChecks.id, checkId), eq(travelChecks.tripId, tripId)));
  });
}
