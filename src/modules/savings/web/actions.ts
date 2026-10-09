"use server";

import { refresh } from "next/cache";
import { requireSession } from "@/core/auth";
import { updateTags } from "@/core/cache";
import { INVALID_FORM_MESSAGE, formFlag, formId, formText, runAction } from "@/core/form";
import type { FormState } from "@/core/ui/form-message";
import { formatTwd } from "../lib/money";
import { dateToMonth, formatMonth } from "../lib/month";
import { entryLabel } from "../lib/summary";
import { savingsTags } from "../service/cache-tags";
import * as service from "../service/savings";

export type { FormState } from "@/core/ui/form-message";

const goalFields = (formData: FormData) => ({
  name: formText(formData, "name"),
  monthlyAmount: formText(formData, "monthlyAmount"),
  note: formText(formData, "note"),
});

// 記帳的寫入都是單一指令或交易，失敗時不會只寫一半，所以寫入成功後才讓 tag 失效

const attempt = (action: string, work: () => Promise<string | void>) =>
  runAction({ module: "savings", action }, (error) => error instanceof service.SavingsUserError, work);

// 一律用登入者的 id 呼叫 service：表單送來的 id 只決定操作哪一筆，別人的會被當作不存在

export async function createGoalAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireSession();
  return attempt("新增項目", async () => {
    const goal = await service.createGoal(userId, goalFields(formData));
    updateTags(savingsTags.goals);
    return `已新增「${goal.name}」，每月 ${formatTwd(goal.monthlyAmount)}`;
  });
}

export async function updateGoalAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireSession();
  const id = formId(formData, "goalId");
  if (id === null) return { error: INVALID_FORM_MESSAGE };
  return attempt("修改項目", async () => {
    await service.updateGoal(userId, id, goalFields(formData));
    // 改名會同步每筆紀錄上的名稱快照
    updateTags(savingsTags.goals, savingsTags.entries);
  });
}

export async function setGoalActiveAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireSession();
  const id = formId(formData, "goalId");
  const active = formFlag(formData, "active");
  if (id === null || active === null) return { error: INVALID_FORM_MESSAGE };
  return attempt(active ? "啟用項目" : "停用項目", async () => {
    await service.setGoalActive(userId, id, active);
    updateTags(savingsTags.goals);
  });
}

export async function moveGoalAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireSession();
  const id = formId(formData, "goalId");
  const direction = formData.get("direction");
  if (id === null || (direction !== "up" && direction !== "down")) return { error: INVALID_FORM_MESSAGE };
  return attempt("調整順序", async () => {
    await service.moveGoal(userId, id, direction);
    updateTags(savingsTags.goals);
  });
}

export async function deleteGoalAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireSession();
  const id = formId(formData, "goalId");
  if (id === null) return { error: INVALID_FORM_MESSAGE };
  return attempt("刪除項目", async () => {
    await service.deleteGoal(userId, id);
    // 紀錄的 goal_id 會改成 null，每個月份都改標「已刪除」
    updateTags(savingsTags.goals, savingsTags.entries);
  });
}

/** 沒有 goalId 是臨時存款；有帶但格式不對時要擋下，不能默默變成臨時存款 */
export async function addEntryAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireSession();
  const hasGoal = formText(formData, "goalId") !== "";
  const goalId = hasGoal ? formId(formData, "goalId") : null;
  if (hasGoal && goalId === null) return { error: INVALID_FORM_MESSAGE };
  return attempt("記錄存款", async () => {
    const entry = await service.addEntry(userId, {
      goalId,
      month: formText(formData, "month"),
      amount: formText(formData, "amount"),
      note: formText(formData, "note"),
    });
    updateTags(savingsTags.month(dateToMonth(entry.month)), savingsTags.totals);
    return `已記錄 ${formatMonth(dateToMonth(entry.month))}「${entryLabel(entry).label}」${formatTwd(entry.amount)}`;
  });
}

export async function deleteEntryAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireSession();
  const id = formId(formData, "entryId");
  if (id === null) return { error: INVALID_FORM_MESSAGE };
  return attempt("刪除紀錄", async () => {
    const month = await service.deleteEntry(userId, id);
    // 已經被別處刪掉（或不是自己的）時沒有寫入、不失效快取，但畫面上還有那一列，要重新算繪才會消失
    if (month) updateTags(savingsTags.month(month), savingsTags.totals);
    else refresh();
  });
}
