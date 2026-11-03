"use client";

import { startTransition, useActionState, useOptimistic } from "react";
import type { FormState } from "../ui/form-message";
import { useToast } from "../ui/toast";
import { withToast } from "../ui/toast-queue";
import { setModuleAccessAction } from "./actions";

type ModuleAccessBoxProps = { userId: string; moduleId: string; allowed: boolean; label: string };

/** 勾選即存 先改畫面再等伺服器 失敗時退回原本的狀態 錯誤用提示視窗 */
export function ModuleAccessBox({ userId, moduleId, allowed, label }: ModuleAccessBoxProps) {
  const toast = useToast();
  const [shown, setShown] = useOptimistic(allowed);
  const [, formAction, pending] = useActionState<FormState, FormData>(withToast(toast, setModuleAccessAction), {});

  const save = (next: boolean) => {
    // 送出中不設 disabled 停用的輸入框會丟掉焦點 改成不理重複的點擊
    if (pending) return;
    const formData = new FormData();
    formData.set("userId", userId);
    formData.set("moduleId", moduleId);
    formData.set("allowed", String(next));
    startTransition(() => {
      setShown(next);
      formAction(formData);
    });
  };

  return (
    // 勾選框比手指小 外面包一層 44px 的 label
    <label className="inline-grid min-h-11 min-w-11 cursor-pointer place-items-center align-middle">
      <input type="checkbox" aria-label={label} aria-disabled={pending || undefined} checked={shown} onChange={(event) => save(event.target.checked)} className="size-4.5" />
    </label>
  );
}
