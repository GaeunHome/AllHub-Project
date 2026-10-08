"use client";

import { useActionState } from "react";
import { InlineFeedback } from "@/core/ui/form-message";
import { Icon } from "@/core/ui/icon";
import { recheckCaptionsAction, type FormState } from "../actions";

/** 很多頻道上片後才補中文字幕；清單會在背景自動重新檢查，這個按鈕讓人馬上再查一次 */
export function RecheckCaptionsButton({ videoId }: { videoId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(recheckCaptionsAction, {});

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="videoId" value={videoId} />
      {!pending && <InlineFeedback {...state} className="max-w-60 text-right" />}
      <button disabled={pending} className="btn-ghost btn-sm" title="重新檢查有沒有中文字幕">
        <Icon name="refresh-cw" className={pending ? "size-3.5 motion-safe:animate-spin" : "size-3.5"} />
        {pending ? "檢查中…" : "重新檢查"}
      </button>
    </form>
  );
}
