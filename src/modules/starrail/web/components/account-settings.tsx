import type { ReactNode } from "react";
import { ActionButton } from "@/core/ui/action-button";
import { Icon } from "@/core/ui/icon";
import { InfoTip } from "@/core/ui/info-tip";
import { removeAccountAction, setAutoRedeemAction, setGameRemindersAction, setThresholdAction } from "../actions";
import type { StarrailAccountView } from "../../service/accounts";
import { AccountActionForm } from "./account-action-form";

// 帳號設定 名牌右邊與手機上收起來的帳號設定共用

/**
 * 自動兌換 提醒的開關 開拓力門檻與移除 名牌右邊與手機的帳號設定共用
 * side 是電腦上的名牌右邊 開關一欄 門檻與移除一欄 手機上移除放在最後
 */
export function AccountSettings({ account, side = false }: { account: StarrailAccountView; side?: boolean }) {
  const switches = (
    <div className={side ? "flex flex-col items-start gap-3" : "flex flex-wrap items-start gap-x-6 gap-y-3"}>
      <AutoRedeemSetting account={account} />
      <GameRemindersSetting account={account} />
    </div>
  );
  const threshold = (
    <AccountActionForm action={setThresholdAction} accountId={account.id} label="設定開拓力提醒門檻" pendingLabel="儲存中…" icon="bell">
      <input
        type="number"
        name="threshold"
        min={0}
        max={1000}
        aria-label="開拓力提醒門檻"
        defaultValue={account.staminaAlertThreshold ?? ""}
        placeholder="預設：上限 − 20"
        className="input w-44"
      />
    </AccountActionForm>
  );
  const remove = (
    <ActionButton
      action={removeAccountAction}
      fields={{ accountId: account.id }}
      confirmMessage={`確定移除「${account.nickname ?? account.uid}」？之後要重新連結才會再出現。`}
      pendingLabel={
        <>
          <Icon name="trash-2" className="size-4" />
          移除中…
        </>
      }
      className="btn-danger"
    >
      <Icon name="trash-2" className="size-4" />
      移除這個帳號
    </ActionButton>
  );

  if (side) {
    return (
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-10 gap-y-3">
        {switches}
        <div className="flex flex-col items-start gap-3">
          {/* 門檻的表單是 display contents 輸入框與按鈕要包一列 */}
          <div className="flex flex-wrap items-start gap-2">{threshold}</div>
          {remove}
        </div>
      </div>
    );
  }
  return (
    <div className="stack">
      {switches}
      <div className="flex flex-wrap items-start gap-3">
        {threshold}
        <div className="sm:ml-auto">{remove}</div>
      </div>
    </div>
  );
}

/** 開關旁的 i 圓圈收著說明 跟開關一樣高才對齊 */
function SettingWithTip({ tipLabel, tip, children }: { tipLabel: string; tip: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-1">
      {children}
      <span className="flex h-11 items-center">
        <InfoTip label={tipLabel}>{tip}</InfoTip>
      </span>
    </div>
  );
}

/**
 * 每天把社群整理的新兌換碼送到這個帳號 cookie 少了兌換要用的鍵時不能打開
 * 已經打開的照樣可以關掉
 */
export function AutoRedeemSetting({ account }: { account: StarrailAccountView }) {
  const locked = !account.canAutoRedeem && !account.autoRedeem;
  return (
    <SettingWithTip
      tipLabel="關於自動兌換"
      tip={account.canAutoRedeem ? "每天中午自動兌換新的兌換碼，成功會通知你" : "cookie 少了 cookie_token_v2，請重新貼上"}
    >
      <ActionButton
        action={setAutoRedeemAction}
        fields={{ accountId: account.id, enabled: String(!account.autoRedeem) }}
        role="switch"
        aria-checked={account.autoRedeem}
        disabled={locked}
        formClassName="flex flex-col items-start gap-1"
        className="btn-secondary"
      >
        <span aria-hidden className="switch-visual" />
        自動兌換新的兌換碼
      </ActionButton>
    </SettingWithTip>
  );
}

/** 開拓力提醒另外看門檻 這裡只管每日實訓 每週內容與終局挑戰 */
export function GameRemindersSetting({ account }: { account: StarrailAccountView }) {
  return (
    <SettingWithTip tipLabel="關於每日、每週與終局提醒" tip="每日、每週內容與終局挑戰快到期時通知你">
      <ActionButton
        action={setGameRemindersAction}
        fields={{ accountId: account.id, enabled: String(!account.gameReminders) }}
        role="switch"
        aria-checked={account.gameReminders}
        formClassName="flex flex-col items-start gap-1"
        className="btn-secondary"
      >
        <span aria-hidden className="switch-visual" />
        每日、每週與終局提醒
      </ActionButton>
    </SettingWithTip>
  );
}
