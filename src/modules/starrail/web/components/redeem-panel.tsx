"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { FormFeedback } from "@/core/ui/form-message";
import { Icon } from "@/core/ui/icon";
import { redeemCodeAction, type FormState } from "../actions";

/** 兩次兌換之間 HoYoLAB 要等約 5 秒；按完先停用按鈕，免得一直得到「太頻繁」 */
const COOLDOWN_SECONDS = 5;

type RedeemPanelProps = { accountId: number; label: string };

/** 跟官方兌換頁一樣只有輸入框：兌換到頁面上選的那個帳號；兌換碼與結果都不存 */
export function RedeemPanel({ accountId, label }: RedeemPanelProps) {
  const [cooldown, setCooldown] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const [state, action, pending] = useActionState<FormState, FormData>(async (previous, formData) => {
    const result = await redeemCodeAction(previous, formData);
    clearInterval(timer.current);
    setCooldown(COOLDOWN_SECONDS);
    timer.current = setInterval(() => setCooldown((left) => Math.max(0, left - 1)), 1000);
    return result;
  }, {});

  useEffect(() => () => clearInterval(timer.current), []);

  return (
    <section className="stack">
      <h3 className="sr-title">兌換碼</h3>
      <form action={action} className="sr-panel stack p-5 sm:p-6">
        <input type="hidden" name="accountId" value={accountId} />
        <p className="flex flex-wrap items-center gap-2 text-sm text-ink-soft">
          兌換到
          <span className="chip border-[var(--sr-gold-line)] bg-[var(--sr-gold-soft)] text-[#f4d79b]">{label}</span>
        </p>
        {/* 輸入框與按鈕一直在同一行，手機上輸入框縮短、按鈕不換行 */}
        <div className="flex gap-2">
          <input
            name="code"
            required
            maxLength={40}
            aria-label="兌換碼"
            placeholder="輸入兌換碼"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            className="input min-w-0 flex-1 font-mono tracking-widest uppercase"
          />
          <button disabled={pending || cooldown > 0} className="btn-primary min-w-28 shrink-0">
            <Icon name={pending ? "loader-circle" : "sparkles"} className={pending ? "size-4 motion-safe:animate-spin" : "size-4"} />
            {pending ? "兌換中…" : cooldown > 0 ? `請等 ${cooldown} 秒` : "兌換"}
          </button>
        </div>
        {!pending && <FormFeedback state={state} />}
      </form>
    </section>
  );
}
