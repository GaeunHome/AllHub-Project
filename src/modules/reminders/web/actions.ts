"use server";

import { requireModule } from "@/core/auth";
import { updateTags } from "@/core/cache";
import { formId, formText, runAction } from "@/core/form";
import type { FormState } from "@/core/ui/form-message";
import { remindersTags } from "../service/cache-tags";
import { ReminderNotFoundError } from "../service/errors";
import { createItem, deleteItem, updateItem } from "../service/items";

const fieldsOf = (formData: FormData) => ({ title: formText(formData, "title"), date: formText(formData, "date"), notify: formText(formData, "notifyDaysBefore") });

/** 格式不對的 id 跟別人的 id 一樣當作不存在 */
function itemIdOf(formData: FormData): number {
  const id = formId(formData, "id");
  if (id === null) throw new ReminderNotFoundError();
  return id;
}

export async function createReminderAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireModule("reminders");
  return runAction({ module: "reminders", action: "新增提醒" }, async () => {
    const { title } = await createItem(userId, fieldsOf(formData));
    updateTags(remindersTags.items);
    return `已新增「${title}」`;
  });
}

export async function updateReminderAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireModule("reminders");
  return runAction({ module: "reminders", action: "修改提醒" }, async () => {
    const { title } = await updateItem(userId, itemIdOf(formData), fieldsOf(formData));
    updateTags(remindersTags.items);
    return `已儲存「${title}」`;
  });
}

export async function deleteReminderAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireModule("reminders");
  return runAction({ module: "reminders", action: "刪除提醒" }, async () => {
    const { title } = await deleteItem(userId, itemIdOf(formData));
    updateTags(remindersTags.items);
    return `已刪除「${title}」`;
  });
}
