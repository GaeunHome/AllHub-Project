"use client";

import { useId } from "react";
import { useDialogForm } from "@/core/ui/dialog";
import { Fact, FactList } from "@/core/ui/fact-list";
import { FormButtons } from "@/core/ui/form-buttons";
import { FormFeedback } from "@/core/ui/form-message";
import { formatSlashDate, type DateKey } from "../../../lib/dates";
import { confirmOccurrenceAction } from "../../actions";
import { priceText } from "../../format";
import type { ConfirmDraft } from "../../pending-view";
import { AmountField, DateField, NoteField } from "../forms/fields";
import { SharesField } from "../investments/holding-forms";

type ConfirmFormProps = { draft: ConfirmDraft; today: DateKey; onDone: (message: string | undefined) => void; onCancel: () => void };

/**
 * 確認這一期 金額與日期可以改 備註留空就用規則的預設
 * 定期定額先照收盤價估好股數與扣款 讀不到股價時留空自己填
 */
export function ConfirmForm({ draft, today, onDone, onCancel }: ConfirmFormProps) {
  const { state, pending, formProps } = useDialogForm(confirmOccurrenceAction, onDone);
  const hintId = useId();
  const buy = draft.regularBuy;

  return (
    <form {...formProps} className="stack">
      <input type="hidden" name="ruleId" value={draft.ruleId} />
      <input type="hidden" name="period" value={draft.period} />
      <FactList>
        {draft.where.map((fact) => (
          <Fact key={fact.label} label={fact.label}>
            {fact.value}
          </Fact>
        ))}
      </FactList>
      {buy ? (
        <div className="field">
          <div className="grid gap-4 sm:grid-cols-2">
            <SharesField defaultValue={buy.estimate?.shares} autoFocus describedBy={hintId} />
            <AmountField name="amount" label="實際扣款（含手續費）" defaultValue={buy.estimate?.cost} required />
          </div>
          {/* 兩個欄位都是估的 說明寫在下面一整行 */}
          <p id={hintId} className="text-sm text-ink">
            {estimateHint(buy)}
          </p>
        </div>
      ) : (
        <AmountField name="amount" label="金額（元）" defaultValue={draft.amount} required autoFocus large />
      )}
      <DateField defaultValue={draft.date} today={today} min={draft.minDate} />
      <NoteField placeholder={draft.notePlaceholder} />
      {!pending && <FormFeedback state={{ error: state.error }} />}
      <FormButtons pending={pending} onCancel={onCancel} label="確認" pendingLabel="記錄中…" />
    </form>
  );
}

function estimateHint(buy: NonNullable<ConfirmDraft["regularBuy"]>): string {
  if (buy.closeCents === null || buy.quoteDate === null) return "股價暫時無法讀取，請照券商 App 填";
  return `依 ${formatSlashDate(buy.quoteDate)} 收盤 ${priceText(buy.closeCents)} 估算，以券商 App 為準`;
}
