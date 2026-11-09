"use server";

import { requireModule } from "@/core/auth";
import { updateTags } from "@/core/cache";
import { runAction } from "@/core/action";
import { INVALID_FORM_MESSAGE, formFlag, formId, formText, toId } from "@/core/form";
import type { FormState } from "@/core/ui/form-message";
import { weatherTags } from "../service/cache-tags";
import { addPlace, deletePlace, movePlace } from "../service/places";
import { saveSettings } from "../service/settings";

/** 一律寫登入者自己的那一列 沒勾的 checkbox 不會送出 所以讀不到就是關 */
export async function saveSettingsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireModule("weather");
  return runAction({ module: "weather", action: "儲存天氣設定" }, async () => {
    await saveSettings(userId, { county: formText(formData, "county"), rainAlert: formFlag(formData, "rainAlert") === true, warningAlert: formFlag(formData, "warningAlert") === true });
    updateTags(weatherTags.settings);
    return "已儲存";
  });
}

export async function addPlaceAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireModule("weather");
  return runAction({ module: "weather", action: "新增城市" }, async () => {
    const { name } = await addPlace(userId, formText(formData, "choice"));
    updateTags(weatherTags.places);
    return `已新增 ${name}`;
  });
}

/** 上移下移不是表單 參數可能被改過 只收正整數 */
export async function movePlaceAction(id: number, beforeId: number | null): Promise<FormState> {
  const { id: userId } = await requireModule("weather");
  if (toId(id) === null || (beforeId !== null && toId(beforeId) === null)) return { error: INVALID_FORM_MESSAGE };
  return runAction({ module: "weather", action: "調整城市順序" }, async () => {
    if (await movePlace(userId, id, beforeId)) updateTags(weatherTags.places);
  });
}

export async function deletePlaceAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireModule("weather");
  const id = formId(formData, "id");
  if (id === null) return { error: INVALID_FORM_MESSAGE };
  return runAction({ module: "weather", action: "刪除城市" }, async () => {
    const { name } = await deletePlace(userId, id);
    updateTags(weatherTags.places);
    return `已移除 ${name}`;
  });
}
