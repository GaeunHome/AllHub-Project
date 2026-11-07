"use server";

import { requireModule } from "@/core/auth";
import { updateTags } from "@/core/cache";
import { runAction } from "@/core/action";
import { INVALID_FORM_MESSAGE, formFlag, formId, formText } from "@/core/form";
import type { FormState } from "@/core/ui/form-message";
import { transitTags } from "../service/cache-tags";
import { RouteNotFoundError } from "../service/errors";
import { addRoute, deleteRoute, moveRoute, setTracked } from "../service/routes";
import { routeLabel } from "./transit-view";

/** 格式不對的 id 跟別人的 id 一樣當作不存在 */
function routeIdOf(formData: FormData): number {
  const id = formId(formData, "id");
  if (id === null) throw new RouteNotFoundError();
  return id;
}

export async function addRouteAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireModule("transit");
  return runAction({ module: "transit", action: "新增常用路線" }, async () => {
    const route = await addRoute(userId, { mode: formText(formData, "mode"), system: formText(formData, "system"), line: formText(formData, "line"), originId: formText(formData, "originId"), destinationId: formText(formData, "destinationId") });
    updateTags(transitTags.routes);
    return `已加到常用路線：${routeLabel(route)}`;
  });
}

export async function deleteRouteAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireModule("transit");
  return runAction({ module: "transit", action: "刪除常用路線" }, async () => {
    const route = await deleteRoute(userId, routeIdOf(formData));
    updateTags(transitTags.routes);
    return `已刪除 ${routeLabel(route)}`;
  });
}

export async function setTrackedAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireModule("transit");
  const tracked = formFlag(formData, "tracked");
  if (tracked === null) return { error: INVALID_FORM_MESSAGE };
  return runAction({ module: "transit", action: "變更追蹤" }, async () => {
    await setTracked(userId, routeIdOf(formData), tracked);
    updateTags(transitTags.routes);
  });
}

/** 側邊欄拖曳或方向鍵排順序 畫面先換好 傳放到哪一條前面 */
export async function moveRouteAction(id: number, beforeId: number | null): Promise<FormState> {
  const { id: userId } = await requireModule("transit");
  if (!Number.isSafeInteger(id) || (beforeId !== null && !Number.isSafeInteger(beforeId))) return { error: INVALID_FORM_MESSAGE };
  return runAction({ module: "transit", action: "調整常用路線順序" }, async () => {
    if (await moveRoute(userId, id, beforeId)) updateTags(transitTags.routes);
  });
}
