"use client";

import { useActionState } from "react";
import { FormFeedback, type FormState } from "@/core/ui/form-message";
import { joinTripAction } from "../actions";

/** 打開連結不會自動加入 要按了才算 */
export function JoinForm({ tripId, token }: { tripId: number; token: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(joinTripAction, {});
  return (
    <form action={action} className="stack">
      <input type="hidden" name="tripId" value={tripId} />
      <input type="hidden" name="token" value={token} />
      <FormFeedback state={{ error: state.error }} />
      <button disabled={pending} className="btn-primary self-start">
        {pending ? "加入中…" : "加入這趟旅程"}
      </button>
    </form>
  );
}
