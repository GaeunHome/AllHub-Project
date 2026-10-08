"use client";

import { useActionState } from "react";
import { FormFeedback } from "@/core/ui/form-message";
import { Icon } from "@/core/ui/icon";
import { addChannelAction, renewAction, type FormState } from "../actions";

export function AddChannelForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(addChannelAction, {});
  const [renewState, renew, renewing] = useActionState<FormState>(renewAction, {});

  return (
    <div className="card flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <form action={action} className="flex min-w-64 flex-1 gap-2">
          <input name="channel" placeholder="頻道網址、@帳號或 UC 開頭的頻道 ID" required className="input flex-1" />
          <button disabled={pending} className="btn-primary">
            <Icon name="plus" className="size-4" />
            {pending ? "加入中…" : "追蹤"}
          </button>
        </form>
        <form action={renew}>
          <button disabled={renewing} className="btn-secondary" title="重新訂閱快到期或失敗的頻道">
            <Icon name="refresh-cw" className={renewing ? "size-4 motion-safe:animate-spin" : "size-4"} />
            {renewing ? "續訂中…" : "續訂"}
          </button>
        </form>
      </div>
      {!pending && <FormFeedback state={state} />}
      {!renewing && <FormFeedback state={renewState} />}
    </div>
  );
}
