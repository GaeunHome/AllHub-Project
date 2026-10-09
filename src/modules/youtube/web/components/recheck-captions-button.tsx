"use client";

import { useActionState } from "react";
import { InlineFeedback } from "@/core/ui/form-message";
import { Icon } from "@/core/ui/icon";
import { recheckCaptionsAction, type FormState } from "../actions";

/** 影片 ⋮ 選單裡的「重新檢查中文字幕」：很多頻道上片後才補字幕，清單會在背景自動檢查，這裡讓人馬上再查一次 */
export function RecheckCaptionsButton({ videoId }: { videoId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(recheckCaptionsAction, {});

  return (
    <form action={action} className="flex flex-col gap-1">
      <input type="hidden" name="videoId" value={videoId} />
      <button disabled={pending} className="menu-item">
        <Icon name="refresh-cw" className={pending ? "size-4 motion-safe:animate-spin" : "size-4"} />
        {pending ? "檢查中…" : "重新檢查中文字幕"}
      </button>
      {!pending && <InlineFeedback {...state} className="px-3 pb-1" />}
    </form>
  );
}
