"use client";

import { useActionState } from "react";
import { INVITE_DAY_OPTIONS, INVITE_NOTE_MAX_LENGTH, INVITE_USE_OPTIONS } from "../auth/invite-rules";
import { CopyButton } from "../ui/copy-button";
import { FormFeedback } from "../ui/form-message";
import { Icon } from "../ui/icon";
import { createInviteAction, type InviteFormState } from "./actions";

// legend 預設會壓在 fieldset 的邊框上、也不吃父層的 gap；浮動後變成一般的子元素，跟其他欄位的標籤一樣排
const LEGEND_CLASS = "field-label float-left";

export function CreateInviteForm() {
  const [state, action, pending] = useActionState<InviteFormState, FormData>(createInviteAction, {});

  return (
    <div className="stack">
      <form action={action} className="stack">
        <fieldset className="field min-w-0">
          <legend className={LEGEND_CLASS}>期限</legend>
          <div className="grid grid-cols-3 gap-2">
            {INVITE_DAY_OPTIONS.map((days) => (
              <label key={days} className="choice-card justify-center">
                <input type="radio" name="days" value={days} defaultChecked={days === 7} className="size-4 shrink-0" />
                {days} 天
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="field min-w-0">
          <legend className={LEGEND_CLASS}>可以註冊幾個帳號</legend>
          <div className="grid grid-cols-3 gap-2">
            {INVITE_USE_OPTIONS.map((uses) => (
              <label key={uses} className="choice-card justify-center">
                <input type="radio" name="uses" value={uses} defaultChecked={uses === 1} className="size-4 shrink-0" />
                {uses} 次
              </label>
            ))}
          </div>
        </fieldset>
        <label className="field">
          <span className="field-label">備註（選填，只有你看得到）</span>
          <input name="note" maxLength={INVITE_NOTE_MAX_LENGTH} placeholder="例如：給小明" className="input" />
        </label>
        <FormFeedback state={state} />
        <button disabled={pending} className="btn-primary self-start">
          <Icon name="plus" className="size-4" />
          {pending ? "建立中…" : "建立邀請連結"}
        </button>
      </form>
      {state.link && <InviteCreated link={state.link} />}
    </div>
  );
}

/** 資料庫只存雜湊，這是唯一能看到完整連結的時候 */
export function InviteCreated({ link }: { link: string }) {
  return (
    <div role="status" className="notice">
      <Icon name="link" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className="font-semibold">邀請連結只會顯示這一次</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input readOnly value={link} aria-label="邀請連結" onFocus={(event) => event.currentTarget.select()} className="input min-w-0 flex-1 font-mono" />
          <CopyButton text={link} label="複製連結" className="btn-primary shrink-0" />
        </div>
        <p>關掉或重新整理這一頁後就看不到了。請用私訊傳給對方，不要貼在公開的地方。</p>
      </div>
    </div>
  );
}
