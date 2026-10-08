"use client";

import { useActionState, useOptimistic, startTransition } from "react";
import { InlineFeedback, type FormState } from "./form-message";
import { Icon } from "./icon";
import { notifyToggleFormData } from "./notify-toggle-form";

type NotifyToggleProps = {
  /** 模組的 Server Action：用 parseNotifyToggle 解析，自己負責 requireSession */
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  id: number;
  enabled: boolean;
  /** 給報讀器與提示文字用，例如主播或頻道名稱 */
  subject: string;
};

/** 主播、頻道列表上的通知開關；先切換圖示再等伺服器，按下去立刻有反應 */
export function NotifyToggle({ action, id, enabled, subject }: NotifyToggleProps) {
  const [shown, setShown] = useOptimistic(enabled);
  const [state, formAction, pending] = useActionState(action, {});

  const toggle = () => {
    const next = !shown;
    startTransition(() => {
      setShown(next);
      formAction(notifyToggleFormData(id, next));
    });
  };

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <button
        type="button"
        role="switch"
        aria-checked={shown}
        aria-label={`${subject} 的通知`}
        title={shown ? "通知開啟中，點一下關閉" : "通知已關閉，點一下開啟"}
        disabled={pending}
        onClick={toggle}
        className={shown ? "btn-secondary btn-sm min-w-9 px-2.5" : "btn-ghost btn-sm min-w-9 px-2.5 text-muted"}
      >
        <Icon name={shown ? "bell" : "bell-off"} className="size-4" />
        <span className="sr-only sm:not-sr-only">{shown ? "通知" : "靜音"}</span>
      </button>
      <InlineFeedback error={state.error} className="max-w-48 text-right" />
    </div>
  );
}
