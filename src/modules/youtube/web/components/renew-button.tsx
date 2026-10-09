"use client";

import { useActionState } from "react";
import { FormFeedback, type FormState } from "@/core/ui/form-message";
import { Icon } from "@/core/ui/icon";
import { renewAction } from "../actions";

/** 訂閱內容旁的「續訂」：WebSub 的訂閱會到期，排程會自動續訂，失敗或快到期時也可以手動再送一次 */
export function RenewButton() {
  const [state, renew, renewing] = useActionState<FormState>(renewAction, {});

  return (
    <div className="flex flex-col items-end gap-2">
      <form action={renew}>
        <button disabled={renewing} className="yt-pill yt-pill-sm" title="重新訂閱快到期或失敗的頻道">
          <Icon name="refresh-cw" className={renewing ? "size-4 motion-safe:animate-spin" : "size-4"} />
          {renewing ? "續訂中…" : "續訂"}
        </button>
      </form>
      {!renewing && <FormFeedback state={state} />}
    </div>
  );
}
