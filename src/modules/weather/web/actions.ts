"use server";

import { requireModule } from "@/core/auth";
import { updateTags } from "@/core/cache";
import { runAction } from "@/core/action";
import { INVALID_FORM_MESSAGE, formFlag, formId, formText } from "@/core/form";
import type { FormState } from "@/core/ui/form-message";
import { weatherTags } from "../service/cache-tags";
import { addPlace, deletePlace } from "../service/places";
import { saveSettings } from "../service/settings";
import { searchCities } from "../service/weather";
import type { WorldPlace } from "../lib/weekly";

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

export async function deletePlaceAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireModule("weather");
  const id = formId(formData, "id");
  if (id === null) return { error: INVALID_FORM_MESSAGE };
  return runAction({ module: "weather", action: "刪除城市" }, async () => {
    const { name } = await deletePlace(userId, id);
    updateTags(weatherTags.places);
    return `已刪除 ${name}`;
  });
}

/** 打字時才查 不寫資料庫 所以不走 runAction 查不到與連不上都回空的 */
export async function searchCitiesAction(name: string): Promise<WorldPlace[]> {
  await requireModule("weather");
  const query = name.trim().slice(0, 60);
  return query ? ((await searchCities(query)) ?? []) : [];
}
