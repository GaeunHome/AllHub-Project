"use server";

import { requireSession } from "@/core/auth";
import { updateTags } from "@/core/cache";
import { formFlag, formText, runAction } from "@/core/form";
import type { FormState } from "@/core/ui/form-message";
import { weatherTags } from "../service/cache-tags";
import { saveSettings } from "../service/settings";

/** 一律寫登入者自己的那一列 沒勾的 checkbox 不會送出 所以讀不到就是關 */
export async function saveSettingsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireSession();
  return runAction({ module: "weather", action: "儲存天氣設定" }, async () => {
    await saveSettings(userId, { county: formText(formData, "county"), rainAlert: formFlag(formData, "rainAlert") === true });
    updateTags(weatherTags.settings);
    return "已儲存";
  });
}
