"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { runAction } from "@/core/action";
import { requireModule, type SessionUser } from "@/core/auth";
import { displayNameOf } from "@/core/auth/nickname";
import { updateTags } from "@/core/cache";
import { logError } from "@/core/errors";
import { formFlag, formId, formText, formUuid } from "@/core/form";
import type { FormState } from "@/core/ui/form-message";
import { isRealDateKey } from "@/core/time";
import { TRAVEL_HREF, tripHref } from "../lib/urls";
import { travelTags } from "../service/cache-tags";
import { TripNotFoundError } from "../service/errors";
import { addCheck, addComment, deleteCheck, deleteComment, setCheckDone } from "../service/extras";
import { addItem, deleteItem, moveItem, updateItem, type ItemInput } from "../service/items";
import { announceTripChange } from "../service/notices";
import { createTrip, deleteTrip, joinTrip, leaveTrip, removeMember, setJoinLink, updateTrip } from "../service/trips";

const run = (action: string, tripId: number | null, work: () => Promise<FormState | string | void>) => runAction({ module: "travel", action, target: tripId === null ? null : `旅程 #${tripId}` }, work);

const tripFields = (formData: FormData) => ({ title: formText(formData, "title"), destination: formText(formData, "destination"), startDate: formText(formData, "startDate"), endDate: formText(formData, "endDate") });

const itemFields = (formData: FormData): ItemInput => ({
  kind: formText(formData, "kind"),
  title: formText(formData, "title"),
  mapsUrl: formText(formData, "mapsUrl"),
  note: formText(formData, "note"),
  stayMinutes: formText(formData, "stayMinutes"),
  travelMinutes: formText(formData, "travelMinutes"),
  fixedTime: formText(formData, "fixedTime"),
});

/** 格式不對的 id 跟別人的旅程一樣當作不存在 */
function idOf(formData: FormData, name: string): number {
  const id = formId(formData, name);
  if (id === null) throw new TripNotFoundError();
  return id;
}

const dayOf = (value: unknown) => (typeof value === "string" && isRealDateKey(value) ? value : null);

/** 其他成員靠通知知道行程變了 回應送出後才寫 通知寄不出去不影響剛才的修改 */
function announce(user: SessionUser, tripId: number, joined = false): void {
  after(() => announceTripChange({ tripId, actorId: user.id, actorName: displayNameOf(user), joined }).catch((error: unknown) => logError("travel", "行程更新通知失敗", error)));
}

export async function createTripAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireModule("travel");
  let created: number | undefined;
  const state = await run("建立旅程", null, async () => {
    created = (await createTrip(userId, tripFields(formData))).id;
    updateTags(travelTags.trips, travelTags.members);
  });
  if (created === undefined) return state;
  redirect(tripHref(created));
}

export async function updateTripAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireModule("travel");
  const tripId = formId(formData, "tripId");
  return run("修改旅程", tripId, async () => {
    if (tripId === null) throw new TripNotFoundError();
    const { title } = await updateTrip(user.id, tripId, tripFields(formData));
    updateTags(travelTags.trips, travelTags.items);
    announce(user, tripId);
    return `已儲存「${title}」`;
  });
}

export async function deleteTripAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireModule("travel");
  const tripId = formId(formData, "tripId");
  const state = await run("刪除旅程", tripId, async () => {
    if (tripId === null) throw new TripNotFoundError();
    await deleteTrip(userId, tripId);
    updateTags(...Object.values(travelTags));
  });
  if (state.error) return state;
  redirect(TRAVEL_HREF);
}

export async function leaveTripAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireModule("travel");
  const tripId = formId(formData, "tripId");
  const state = await run("離開旅程", tripId, async () => {
    if (tripId === null) throw new TripNotFoundError();
    await leaveTrip(userId, tripId);
    updateTags(travelTags.trips, travelTags.members);
  });
  if (state.error) return state;
  redirect(TRAVEL_HREF);
}

export async function removeMemberAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireModule("travel");
  const tripId = formId(formData, "tripId");
  const memberId = formUuid(formData, "memberId");
  return run("移除成員", tripId, async () => {
    if (tripId === null || memberId === null) throw new TripNotFoundError();
    await removeMember(userId, tripId, memberId);
    updateTags(travelTags.members);
    return "已移除";
  });
}

export async function setJoinLinkAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireModule("travel");
  const tripId = formId(formData, "tripId");
  const open = formFlag(formData, "open");
  return run(open ? "打開群組連結" : "撤銷群組連結", tripId, async () => {
    if (tripId === null || open === null) throw new TripNotFoundError();
    await setJoinLink(userId, tripId, open);
    updateTags(travelTags.trips);
    return open ? "已產生群組連結" : "已撤銷，舊的連結不能再用";
  });
}

export async function joinTripAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireModule("travel");
  const tripId = formId(formData, "tripId");
  const state = await run("加入旅程", tripId, async () => {
    if (tripId === null) throw new TripNotFoundError();
    await joinTrip(user.id, tripId, formText(formData, "token"));
    updateTags(travelTags.trips, travelTags.members);
    announce(user, tripId, true);
  });
  if (state.error || tripId === null) return state;
  redirect(tripHref(tripId));
}

export async function addItemAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireModule("travel");
  const tripId = formId(formData, "tripId");
  return run("新增行程", tripId, async () => {
    if (tripId === null) throw new TripNotFoundError();
    const { title } = await addItem(user.id, tripId, dayOf(formData.get("day")), itemFields(formData));
    updateTags(travelTags.items);
    announce(user, tripId);
    return `已新增「${title}」`;
  });
}

export async function updateItemAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireModule("travel");
  const tripId = formId(formData, "tripId");
  return run("修改行程", tripId, async () => {
    if (tripId === null) throw new TripNotFoundError();
    const { title } = await updateItem(user.id, tripId, idOf(formData, "itemId"), idOf(formData, "version"), itemFields(formData));
    updateTags(travelTags.items);
    announce(user, tripId);
    return `已儲存「${title}」`;
  });
}

/** 綁定旅程 id 後傳給選單裡的刪除 id 欄位是項目 */
export async function deleteItemAction(tripId: number, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireModule("travel");
  return run("刪除行程", tripId, async () => {
    const { title } = await deleteItem(user.id, tripId, idOf(formData, "id"));
    updateTags(travelTags.items, travelTags.comments);
    announce(user, tripId);
    return `已刪除「${title}」`;
  });
}

/** 拖曳放開時直接呼叫 不經表單 這些值來自瀏覽器 一律當成不可信 */
export async function moveItemAction(tripId: number, itemId: number, toDay: string | null, beforeId: number | null): Promise<FormState> {
  const user = await requireModule("travel");
  return run("調整行程順序", tripId, async () => {
    if (!(await moveItem(user.id, tripId, itemId, dayOf(toDay), beforeId))) return;
    updateTags(travelTags.items);
    announce(user, tripId);
  });
}

export async function addCommentAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireModule("travel");
  const tripId = formId(formData, "tripId");
  return run("新增留言", tripId, async () => {
    if (tripId === null) throw new TripNotFoundError();
    await addComment(user.id, tripId, idOf(formData, "itemId"), formText(formData, "body"));
    updateTags(travelTags.comments);
    announce(user, tripId);
    return "已留言";
  });
}

export async function deleteCommentAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireModule("travel");
  const tripId = formId(formData, "tripId");
  return run("刪除留言", tripId, async () => {
    if (tripId === null) throw new TripNotFoundError();
    await deleteComment(userId, tripId, idOf(formData, "commentId"));
    updateTags(travelTags.comments);
    return "已刪除留言";
  });
}

export async function addCheckAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireModule("travel");
  const tripId = formId(formData, "tripId");
  return run("新增清單項目", tripId, async () => {
    if (tripId === null) throw new TripNotFoundError();
    await addCheck(user.id, tripId, formText(formData, "title"));
    updateTags(travelTags.checks);
    announce(user, tripId);
  });
}

export async function setCheckDoneAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireModule("travel");
  const tripId = formId(formData, "tripId");
  const done = formFlag(formData, "done");
  return run("勾選清單項目", tripId, async () => {
    if (tripId === null || done === null) throw new TripNotFoundError();
    await setCheckDone(userId, tripId, idOf(formData, "checkId"), done);
    updateTags(travelTags.checks);
  });
}

export async function deleteCheckAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireModule("travel");
  const tripId = formId(formData, "tripId");
  return run("刪除清單項目", tripId, async () => {
    if (tripId === null) throw new TripNotFoundError();
    await deleteCheck(userId, tripId, idOf(formData, "checkId"));
    updateTags(travelTags.checks);
  });
}
