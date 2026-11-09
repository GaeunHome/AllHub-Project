"use client";

import { useActionState, useEffect, useState } from "react";
import type { FormState } from "@/core/ui/form-message";
import { Icon } from "@/core/ui/icon";
import { useToast, type ToastApi } from "@/core/ui/toast";
import { normalizeRedeemCode } from "../../lib/redeem";
import { redeemCodeAction } from "../actions";
import { GoldChip } from "./sr-visuals";

/** 兩次兌換之間 HoYoLAB 要等約 5 秒 按完先停用按鈕免得一直太頻繁 */
const COOLDOWN_SECONDS = 5;

/**
 * 結果用提示視窗 標題寫結果與剛才兌換的碼 送出後輸入框會清空
 * 碼照伺服器同一套規則整理 標的就是實際送出的碼
 */
export function redeemFormAction(action: (previous: FormState, formData: FormData) => Promise<FormState>, toast: ToastApi, onSubmitted: () => void) {
  return async (previous: FormState, formData: FormData): Promise<FormState> => {
    const result = await action(previous, formData);
    onSubmitted();
    const reason = result.error ?? result.message;
    if (!reason) return result;
    const normalized = normalizeRedeemCode(String(formData.get("code") ?? ""));
    const title = `${result.error ? "兌換失敗" : "兌換成功"}${normalized.ok ? `：${normalized.code}` : ""}`;
    if (result.error) toast.error(title, reason);
    else toast.success(title, reason);
    return result;
  };
}

type RedeemPanelProps = { accountId: number; server: string; name: string };

/** 跟官方兌換頁一樣只有輸入框 兌換到頁面上選的帳號 碼與結果都不存 */
export function RedeemPanel({ accountId, server, name }: RedeemPanelProps) {
  const toast = useToast();
  const [cooldown, setCooldown] = useState(0);
  const [, action, pending] = useActionState<FormState, FormData>(redeemFormAction(redeemCodeAction, toast, () => setCooldown(COOLDOWN_SECONDS)), {});

  // 每秒倒數一次 數到 0 就停 離開頁面時清掉計時器
  useEffect(() => {
    if (cooldown === 0) return;
    const timer = setTimeout(() => setCooldown((left) => Math.max(0, left - 1)), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  return (
    <section className="stack">
      <h3 className="sr-title">兌換碼</h3>
      <form action={action} className="sr-panel stack p-5 sm:p-6">
        <input type="hidden" name="accountId" value={accountId} />
        <p className="flex flex-wrap items-center gap-2 text-sm text-ink">
          兌換到
          <GoldChip>{server}</GoldChip>
          <span className="chip">{name}</span>
        </p>
        {/* 輸入框與按鈕一直在同一行 手機上輸入框縮短 按鈕不換行 */}
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
          {/* 寬度放得下最長的請等 5 秒 換字時按鈕與輸入框的寬度不變 */}
          <button disabled={pending || cooldown > 0} className="btn-primary min-w-30 shrink-0">
            <Icon name={pending ? "loader-circle" : "sparkles"} className={pending ? "size-4 motion-safe:animate-spin" : "size-4"} />
            {pending ? "兌換中…" : cooldown > 0 ? `請等 ${cooldown} 秒` : "兌換"}
          </button>
        </div>
      </form>
    </section>
  );
}
