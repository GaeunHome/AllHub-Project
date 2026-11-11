"use server";

import { requireModule } from "@/core/auth";
import { updateTags } from "@/core/cache";
import { INVALID_FORM_MESSAGE, formId } from "@/core/form";
import type { FormState } from "@/core/ui/form-message";
import { formatNumber, formatTwd } from "../lib/money";
import { formatMonthShort } from "../lib/month";
import { recurringTitle, scheduleText } from "../lib/recurring";
import { parsePeriod } from "../lib/validation";
import { savingsTags } from "../service/cache-tags";
import { confirmOccurrence, createRecurring, deleteRecurring, setRecurringActive, skipOccurrence, updateRecurring } from "../service/recurring";
import { attempt, readFields, readNames, remove, setActive, type Names } from "./action-helpers";
import { plannedAmount } from "./format";

// 固定收支 與確認或略過這個月要做的事的一期

const RECURRING_FIELDS = [
  "kind",
  "accountId",
  "counterAccountId",
  "categoryId",
  "amount",
  "dayOfMonth",
  "note",
  "name",
  "intervalMonths",
  "startMonth",
  "holidayRule",
  "mode",
  "holdingId",
  "allocate",
  "subscription",
] as const;
const CONFIRM_FIELDS = ["ruleId", "period", "amount", "date", "note", "shares"] as const;
const SKIP_FIELDS = ["ruleId", "period"] as const;

type RuleShape = Parameters<typeof recurringTitle>[0] & Parameters<typeof scheduleText>[0] & { amount: number };

/** 成功訊息寫出名稱 排程與金額 看得出存的是哪一條 */
function describeRule(rule: RuleShape, names: Names): string {
  return `「${recurringTitle(rule, names.maps)}」${scheduleText(rule)}，${plannedAmount(rule.kind, rule.amount)}`;
}

export async function createRecurringAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireModule("savings");
  return attempt("新增固定收支", async () => {
    const names = await readNames(userId, { holdings: true });
    const rule = await createRecurring(userId, readFields(formData, RECURRING_FIELDS));
    updateTags(savingsTags.recurring);
    return `已新增固定收支${describeRule(rule, names)}`;
  });
}

export async function updateRecurringAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireModule("savings");
  const id = formId(formData, "id");
  if (id === null) return { error: INVALID_FORM_MESSAGE };
  return attempt("儲存固定收支", async () => {
    const names = await readNames(userId, { holdings: true });
    const rule = await updateRecurring(userId, id, readFields(formData, RECURRING_FIELDS));
    updateTags(savingsTags.recurring);
    return `已儲存固定收支${describeRule(rule, names)}`;
  });
}

export async function setRecurringActiveAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireModule("savings");
  return setActive(formData, (active) => (active ? "恢復固定收支" : "停用固定收支"), (id, active) => setRecurringActive(userId, id, active), savingsTags.recurring);
}

export async function deleteRecurringAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireModule("savings");
  // 自動記的紀錄留著 但 recurring_id 改成 null 紀錄上的自動標籤跟著拿掉
  return remove(formData, "刪除固定收支", (id) => deleteRecurring(userId, id), [savingsTags.recurring, savingsTags.transactions]);
}

export async function confirmOccurrenceAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireModule("savings");
  return attempt("確認固定收支", async () => {
    const names = await readNames(userId, { holdings: true });
    const { rule, transaction } = await confirmOccurrence(userId, readFields(formData, CONFIRM_FIELDS));
    // 定期定額走買進 持股也變了
    updateTags(...(transaction.holdingId === null ? [savingsTags.transactions, savingsTags.recurring] : [savingsTags.transactions, savingsTags.recurring, savingsTags.holdings]));
    if (transaction.holdingId !== null) {
      const symbol = names.maps.holdingSymbols.get(transaction.holdingId);
      return `已記下買進${symbol ? ` ${symbol}` : ""} ${formatNumber(transaction.shares ?? 0)} 股 ${formatTwd(transaction.amount)}`;
    }
    const title = `已記下「${recurringTitle(rule, names.maps)}」`;
    if (transaction.kind === "transfer") return `${title}${names.account(transaction.accountId)} → ${names.account(transaction.counterAccountId)} ${formatTwd(transaction.amount)}`;
    return `${title}${plannedAmount(transaction.kind, transaction.amount)}（${names.account(transaction.accountId)}）`;
  });
}

export async function skipOccurrenceAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await requireModule("savings");
  return attempt("略過這一期", async () => {
    const names = await readNames(userId, { holdings: true });
    const fields = readFields(formData, SKIP_FIELDS);
    const rule = await skipOccurrence(userId, fields);
    updateTags(savingsTags.recurring);
    const period = parsePeriod(fields.period);
    return `已略過「${recurringTitle(rule, names.maps)}」${period === null ? "" : `${formatMonthShort(period)}`}這一期`;
  });
}
