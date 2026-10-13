"use client";

import { useActionState, type ReactNode } from "react";
import { ResultBanner } from "@/core/ui/form-message";
import { Icon, type UiIconName } from "@/core/ui/icon";
import type { FormState } from "../actions";

/** seq 每次加一，同樣的結果再出現時也換上新的結果框，報讀器會再念一次 */
export type NumberedState = FormState & { seq?: number };

/** 包住 Server Action：每次的結果都編上新的序號（畫面拿它當結果框的 key） */
export function numberedAction(action: (prev: FormState, formData: FormData) => Promise<FormState>) {
  return async (previous: NumberedState, formData: FormData): Promise<NumberedState> => ({ ...(await action(previous, formData)), seq: (previous.seq ?? 0) + 1 });
}

/** 帳號卡片上的小表單（立即簽到、設定門檻），共用同一套結果顯示 */
export function AccountActionForm({
  action,
  accountId,
  label,
  pendingLabel,
  icon,
  children,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  accountId: number;
  label: string;
  pendingLabel: string;
  icon: UiIconName;
  children?: ReactNode;
}) {
  const [state, formAction, pending] = useActionState<NumberedState, FormData>(numberedAction(action), {});
  // 送出中留著上一次的結果，新結果回來才換掉：結果框不會先消失再出現，下面的內容不會跳一下
  const result = state.error || state.message ? state : null;

  return (
    // contents：欄位與按鈕直接排進外層那一列，按鈕留在原本的位置；結果自己換到最後一整列，不會被擠成按鈕底下的一小欄
    <form action={formAction} className="contents">
      <input type="hidden" name="accountId" value={accountId} />
      {children}
      {/* 跟旁邊的輸入框一樣高（44px） */}
      <button disabled={pending} className="btn-secondary">
        <Icon name={icon} className="size-4" />
        {pending ? pendingLabel : label}
      </button>
      {result && (
        <div key={result.seq} className="order-last basis-full">
          {result.error ? (
            <ResultBanner tone="error" title={`${label}失敗`}>
              {result.error}
            </ResultBanner>
          ) : (
            <ResultBanner tone="success" title={result.message} />
          )}
        </div>
      )}
    </form>
  );
}
