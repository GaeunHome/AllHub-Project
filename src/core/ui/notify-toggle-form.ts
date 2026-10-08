import { formFlag, formId } from "../form";

// NotifyToggle（client）送出、模組的 Server Action 解析，欄位名稱只定義在這裡；不加 "use client"，Server Action 才能呼叫解析函式

const FIELDS = { id: "id", enabled: "enabled" } as const;

export function notifyToggleFormData(id: number, enabled: boolean): FormData {
  const formData = new FormData();
  formData.set(FIELDS.id, String(id));
  formData.set(FIELDS.enabled, String(enabled));
  return formData;
}

/** 欄位被改過時回 null */
export function parseNotifyToggle(formData: FormData): { id: number; enabled: boolean } | null {
  const id = formId(formData, FIELDS.id);
  const enabled = formFlag(formData, FIELDS.enabled);
  return id === null || enabled === null ? null : { id, enabled };
}
