"use client";

import { useActionState, useEffect, useState } from "react";
import { ResultBanner } from "@/core/ui/form-message";
import { Icon } from "@/core/ui/icon";
import { normalizeRedeemCode } from "../../lib/redeem";
import { redeemCodeAction, type FormState } from "../actions";

/** 兩次兌換之間 HoYoLAB 要等約 5 秒；按完先停用按鈕，免得一直得到「太頻繁」 */
const COOLDOWN_SECONDS = 5;

/** 結果連同剛才兌換的碼（送出後輸入框會清空）；seq 每次加一，同樣的結果再出現時也換上新的結果框，報讀器會再念一次 */
export type RedeemState = FormState & { code?: string; seq?: number };

/** 包住兌換的 Server Action：結果帶著跟伺服器同一個函式整理過的碼，畫面上標的就是實際送出的碼 */
export function redeemFormAction(action: (previous: FormState, formData: FormData) => Promise<FormState>, onSubmitted: () => void) {
  return async (previous: RedeemState, formData: FormData): Promise<RedeemState> => {
    const result = await action(previous, formData);
    onSubmitted();
    const normalized = normalizeRedeemCode(String(formData.get("code") ?? ""));
    const seq = (previous.seq ?? 0) + 1;
    return normalized.ok ? { ...result, code: normalized.code, seq } : { ...result, seq };
  };
}

type RedeemPanelProps = { accountId: number; label: string };

/** 跟官方兌換頁一樣只有輸入框：兌換到頁面上選的那個帳號；兌換碼與結果都不存 */
export function RedeemPanel({ accountId, label }: RedeemPanelProps) {
  const [cooldown, setCooldown] = useState(0);
  const [state, action, pending] = useActionState<RedeemState, FormData>(redeemFormAction(redeemCodeAction, () => setCooldown(COOLDOWN_SECONDS)), {});

  // 每秒倒數一次，數到 0 就停；離開頁面時清掉計時器
  useEffect(() => {
    if (cooldown === 0) return;
    const timer = setTimeout(() => setCooldown((left) => Math.max(0, left - 1)), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  return (
    <section className="stack">
      <h3 className="sr-title">兌換碼</h3>
      {/* 超寬螢幕跟簽到紀錄並排、卡片比內容高：多的高度給第一列（「兌換到」貼在它的底），結果框在留好的位置裡長，不推動輸入框；上下都用 1fr 的話格線照內容算高度時兩列一樣高，整列平白變高 */}
      <form action={action} className="sr-panel stack p-5 sm:p-6 2xl:grid 2xl:grid-rows-[1fr_auto_auto]">
        <input type="hidden" name="accountId" value={accountId} />
        <p className="flex flex-wrap items-center gap-2 text-sm text-ink-soft 2xl:self-end">
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
          {/* 寬度放得下最長的「請等 5 秒」：換文字時按鈕不變寬、輸入框不變窄 */}
          <button disabled={pending || cooldown > 0} className="btn-primary min-w-30 shrink-0">
            <Icon name={pending ? "loader-circle" : "sparkles"} className={pending ? "size-4 motion-safe:animate-spin" : "size-4"} />
            {pending ? "兌換中…" : cooldown > 0 ? `請等 ${cooldown} 秒` : "兌換"}
          </button>
        </div>
        {/* 超寬螢幕先留好兩行說明的結果框高度（最長的說明在超寬螢幕是兩行）：卡片不夠高時下一列才不會撐高、把輸入框往上擠；窄螢幕結果接在下面，沒有結果時不佔位。送出中留著上一次的結果，新結果回來才換掉 */}
        <div className="max-2xl:empty:hidden 2xl:min-h-[6.375rem]">
          <RedeemResult key={state.seq} state={state} />
        </div>
      </form>
    </section>
  );
}

/** 結果要一眼看得到：成功或失敗寫在標題，旁邊標出剛才兌換的碼 */
export function RedeemResult({ state }: { state: RedeemState }) {
  const { code } = state;
  if (!state.error && !state.message) return null;
  return (
    <ResultBanner
      tone={state.error ? "error" : "success"}
      title={
        <span className="flex flex-wrap items-center gap-2">
          {state.error ? "兌換失敗" : "兌換成功"}
          {code && <span className="chip font-mono tracking-widest">{code}</span>}
        </span>
      }
    >
      {state.error ?? state.message}
    </ResultBanner>
  );
}
