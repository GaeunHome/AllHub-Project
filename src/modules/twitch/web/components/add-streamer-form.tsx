"use client";

import { useActionState } from "react";
import { FormFeedback, type FormState } from "@/core/ui/form-message";
import { Icon } from "@/core/ui/icon";
import { useToast } from "@/core/ui/toast";
import { withToast } from "@/core/ui/toast-queue";
import { addStreamerAction, syncAction } from "../actions";

/** 輸入錯了留在輸入框下面 成功與同步的結果用提示視窗 */
export function AddStreamerForm() {
  const toast = useToast();
  const [state, action, pending] = useActionState<FormState, FormData>(withToast(toast, addStreamerAction, { errors: false }), {});
  const [, sync, syncing] = useActionState<FormState>(withToast(toast, () => syncAction()), {});

  return (
    <div className="stack">
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
    </div>
  );
}
