"use client";

import { useActionState, type ReactNode } from "react";
import { ResultBanner } from "@/core/ui/form-message";
import { Icon, type UiIconName } from "@/core/ui/icon";
import type { FormState } from "../actions";

/** seq 每次加一 同樣的結果再出現時也換新的結果框 報讀器才會再念 */
export type NumberedState = FormState & { seq?: number };

/** 包住 Server Action 每次的結果都編上新序號 畫面拿它當結果框的 key */
export function numberedAction(action: (prev: FormState, formData: FormData) => Promise<FormState>) {
  return async (previous: NumberedState, formData: FormData): Promise<NumberedState> => ({ ...(await action(previous, formData)), seq: (previous.seq ?? 0) + 1 });
}

/** 帳號卡片上的立即簽到與設定門檻 共用同一套結果顯示 */
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
  // 送出中留著上次的結果 新結果回來才換 結果框不會閃掉 下面的內容不會跳
  const result = state.error || state.message ? state : null;

  return (
    // contents 讓欄位與按鈕直接排進外層那一列 按鈕留在原位
    // 結果自己換到最後一整列 不會被擠成按鈕底下的一小欄
    <form action={formAction} className="contents">
      <input type="hidden" name="accountId" value={accountId} />
      {children}
      {/* 跟旁邊的輸入框一樣是 44px 高 */}
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
