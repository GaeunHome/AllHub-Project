"use client";

import { startTransition, useActionState, useId, useLayoutEffect, useRef, useState } from "react";
import { INVITE_DAY_OPTIONS, INVITE_NOTE_MAX_LENGTH, INVITE_USE_OPTIONS } from "../auth/invite-rules";
import { CopyButton } from "../ui/copy-button";
import { Dialog } from "../ui/dialog";
import { FormFeedback, FormMessage, type FormState } from "../ui/form-message";
import { Icon } from "../ui/icon";
import { createInviteAction, type InviteFormState } from "./actions";

// legend 預設會壓在 fieldset 的邊框上、也不吃父層的 gap；浮動後變成一般的子元素，跟其他欄位的標籤一樣排
const LEGEND_CLASS = "field-label float-left";

export type InviteResult = { dialogOpen: boolean; canReopen: boolean; feedback: FormState };

/** 新的連結自動打開視窗；關掉後表單下方留著「再看一次連結」，離開這一頁或重新整理之前都還看得到，不必用確認視窗擋著關閉；建立下一條失敗時錯誤顯示在表單下方 */
export function inviteResult(state: InviteFormState, closedLink: string | undefined): InviteResult {
  if (!state.link) return { dialogOpen: false, canReopen: false, feedback: state };
  // 視窗開著時按鈕也留在背景：送出時按鈕停用、焦點早就掉了，關掉視窗後要有地方放
  const dialogOpen = state.link !== closedLink;
  const feedback = state.error ? { error: state.error } : dialogOpen ? {} : { message: "已建立邀請連結，可以在下面的清單撤銷" };
  return { dialogOpen, canReopen: true, feedback };
}

/** 建立失敗時留著上一條連結：資料庫只存雜湊，弄丟了就拿不回來 */
export function keepLastLink(previous: InviteFormState, result: InviteFormState): InviteFormState {
  if (result.link || !previous.link) return result;
  return { error: result.error, message: previous.message, link: previous.link };
}

/** 離開這一頁時要忘掉的那一條連結 */
type ForgetLink = { forget: string };

/** 表單送出時建立邀請；離開這一頁時忘掉畫面上的連結（已經換成新的就不動） */
function inviteFormAction(previous: InviteFormState, payload: FormData | ForgetLink): InviteFormState | Promise<InviteFormState> {
  if (!(payload instanceof FormData)) return previous.link === payload.forget ? {} : previous;
  // 上一次的結果不送回伺服器：完整的連結只在建立的回應裡出現一次
  return createInviteAction({}, payload).then((result) => keepLastLink(previous, result));
}

export function CreateInviteForm() {
  const [state, action, pending] = useActionState<InviteFormState, FormData | ForgetLink>(inviteFormAction, {});
  // 記下關掉的是哪一條：建立下一條時照樣自動打開
  const [closedLink, setClosedLink] = useState<string>();
  const result = inviteResult(state, closedLink);
  const dialogId = useId();
  const reopenRef = useRef<HTMLButtonElement>(null);
  const shownLink = useRef(state.link);
  useLayoutEffect(() => {
    shownLink.current = state.link;
  }, [state.link]);
  // 清除函式在 Activity 把頁面藏起來（換到別頁）時會跑：連結只在這一頁看得到，回到這一頁就沒了
  useLayoutEffect(
    () => () => {
      const link = shownLink.current;
      if (link) startTransition(() => action({ forget: link }));
    },
    [action],
  );

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
        {result.canReopen ? (
          <div className="button-row">
            <FormFeedback state={result.feedback} />
            <button ref={reopenRef} type="button" aria-haspopup="dialog" aria-expanded={result.dialogOpen} aria-controls={dialogId} onClick={() => setClosedLink(undefined)} className="btn-secondary btn-sm">
              <Icon name="link" className="size-4" />
              再看一次連結
            </button>
          </div>
        ) : (
          <FormFeedback state={result.feedback} />
        )}
        <button disabled={pending} className="btn-primary self-start">
          <Icon name="plus" className="size-4" />
          {pending ? "建立中…" : "建立邀請連結"}
        </button>
      </form>
      {/* 內容跟視窗一起出現，放在 live region 裡來不及念：建立的結果與提醒改由視窗的 aria-describedby 連同標題念出來，視窗裡只剩複製結果一個 live region */}
      <Dialog
        id={dialogId}
        open={result.dialogOpen}
        onClose={() => {
          setClosedLink(state.link);
          reopenRef.current?.focus();
        }}
        title="邀請連結已建立"
        icon={<Icon name="link" />}
        size="lg"
        describedBy={`${dialogId}-summary ${dialogId}-warning`}
      >
        {state.message && (
          <FormMessage tone="success" id={`${dialogId}-summary`} live={false}>
            {state.message}
          </FormMessage>
        )}
        {state.link && <InviteCreated link={state.link} warningId={`${dialogId}-warning`} />}
      </Dialog>
    </div>
  );
}

/** 資料庫只存雜湊：完整的連結只在建立的這一頁看得到（關掉視窗還能再打開）；warningId 讓視窗的 aria-describedby 指向提醒 */
export function InviteCreated({ link, warningId }: { link: string; warningId?: string }) {
  return (
    <div className="notice">
      <Icon name="link" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p id={warningId} className="font-semibold">
          只在這一頁看得到，重新整理或離開就沒了
        </p>
        {/* 網址很長，單行的輸入框會截掉一段：用唯讀的多行欄位，在任何地方換行、高度跟著內容，整條看得完整（不支援 field-sizing 的瀏覽器至少三行） */}
        <textarea
          readOnly
          value={link}
          rows={3}
          aria-label="邀請連結"
          data-autofocus
          onFocus={(event) => event.currentTarget.select()}
          className="input field-sizing-content resize-none font-mono text-sm break-all"
        />
        <div className="button-row">
          <CopyButton text={link} label="複製連結" className="btn-primary" />
        </div>
        <p>請用私訊傳給對方，不要貼在公開的地方。</p>
      </div>
    </div>
  );
}
