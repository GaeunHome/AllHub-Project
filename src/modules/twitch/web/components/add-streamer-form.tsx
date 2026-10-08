"use client";

import { useActionState } from "react";
import { FormFeedback } from "@/core/ui/form-message";
import { Icon } from "@/core/ui/icon";
import { addStreamerAction, syncAction, type FormState } from "../actions";

export function AddStreamerForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(addStreamerAction, {});
  const [syncState, sync, syncing] = useActionState<FormState>(syncAction, {});

  return (
    <div className="card flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <form action={action} className="flex min-w-64 flex-1 gap-2">
          <input name="login" placeholder="Twitch 帳號或頻道網址" required className="input flex-1" />
          <button disabled={pending} className="btn-primary">
            <Icon name="plus" className="size-4" />
            {pending ? "加入中…" : "追蹤"}
          </button>
        </form>
        <form action={sync}>
          <button disabled={syncing} className="btn-secondary" title="對照 Twitch 更新訂閱狀態，補建失敗的訂閱">
            <Icon name="refresh-cw" className={syncing ? "size-4 motion-safe:animate-spin" : "size-4"} />
            {syncing ? "同步中…" : "同步訂閱"}
          </button>
        </form>
      </div>
      {!pending && <FormFeedback state={state} />}
      {!syncing && <FormFeedback state={syncState} />}
    </div>
  );
}
