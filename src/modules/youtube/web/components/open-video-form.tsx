"use client";

import { useActionState } from "react";
import { FormFeedback } from "@/core/ui/form-message";
import { Icon } from "@/core/ui/icon";
import { openVideoAction, type FormState } from "../actions";

export function OpenVideoForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(openVideoAction, {});

  return (
    <form action={action} className="card flex flex-col gap-3">
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Icon name="link" className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted" />
          <input name="url" placeholder="貼任何 YouTube 影片網址來翻譯字幕" required className="input pl-11" />
        </div>
        <button disabled={pending} className="btn-secondary">
          <Icon name="play" className="size-4" />
          開啟
        </button>
      </div>
      <FormFeedback state={state} />
    </form>
  );
}
