"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import { INVITE_DAY_OPTIONS, INVITE_NOTE_MAX_LENGTH, INVITE_USE_OPTIONS } from "../auth/invite-rules";
import type { ModuleInfo } from "../module";
import { CopyButton } from "../ui/copy-button";
import { Dialog, useDialog, useDialogForm } from "../ui/dialog";
import { FormButtons } from "../ui/form-buttons";
import { FormFeedback, FormMessage } from "../ui/form-message";
import { Icon } from "../ui/icon";
import { useToast } from "../ui/toast";
import { createInviteAction, type InviteFormState } from "./actions";

// legend 預設壓在 fieldset 邊框上又不吃 gap 浮動後才跟一般標籤一樣排
const LEGEND_CLASS = "field-label float-left";

/** 關掉視窗後提示一次 連結還能再看一次 */
const CLOSED_MESSAGE = "已建立邀請連結，可以在清單裡撤銷";

/** 剛建立的連結 資料庫只存雜湊 只留在這一頁的畫面上 */
export type CreatedInvite = { link: string; message?: string };

type Ref<T> = { current: T };

/**
 * 上一次的結果不送回伺服器 完整連結只在建立的回應裡出現一次
 * 連結交給畫面另外記 表單的狀態不留 失敗時上一條也還在
 */
export function submitInvite(onCreated: (created: CreatedInvite) => void) {
  return async (_previous: InviteFormState, formData: FormData): Promise<InviteFormState> => {
    const result = await createInviteAction({}, formData);
    if (!result.link) return result;
    onCreated({ link: result.link, message: result.message });
    return { message: result.message };
  };
}

/** 關掉建立結果的視窗時提示一次 再看一次後關掉或頁面藏起來時跟著關掉都不再提示 */
export function announceOnce(announced: Ref<string | undefined>, link: string | undefined, notify: () => void) {
  if (!link || announced.current === link) return;
  announced.current = link;
  notify();
}

type ForgetParts = {
  announced: Ref<string | undefined>;
  shownLink: Ref<string | undefined>;
  setCreated: (created: null) => void;
  setLinkOpen: (open: false) => void;
};

/** Activity 藏起頁面時的清除函式 連結只在這一頁看得到 回來就沒了 視窗跟著關掉也不提示 */
export function forgetCreated({ announced, shownLink, setCreated, setLinkOpen }: ForgetParts) {
  return () => {
    announced.current = shownLink.current;
    setCreated(null);
    setLinkOpen(false);
  };
}

/**
 * 使用者選的 卡片裡是邀請連結的清單 標題旁的按鈕打開視窗填表單
 * 建立好了自動跳出連結 關掉後還能再看一次
 */
export function CreateInvite({ modules }: { modules: Pick<ModuleInfo, "id" | "name" | "icon" | "accent">[] }) {
  const toast = useToast();
  const form = useDialog();
  const [created, setCreated] = useState<CreatedInvite | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const linkDialogId = useId();
  const reopenRef = useRef<HTMLButtonElement>(null);
  const announced = useRef<string | undefined>(undefined);
  const shownLink = useRef<string | undefined>(undefined);
  useLayoutEffect(() => {
    shownLink.current = created?.link;
  }, [created]);
  useLayoutEffect(() => forgetCreated({ announced, shownLink, setCreated, setLinkOpen }), []);
  const { state, pending, formProps } = useDialogForm(
    submitInvite((next) => {
      setCreated(next);
      setLinkOpen(true);
    }),
    form.close,
  );

  return (
    <>
      <div className="button-row">
        {created && (
          <button ref={reopenRef} type="button" aria-haspopup="dialog" aria-expanded={linkOpen} aria-controls={linkDialogId} onClick={() => setLinkOpen(true)} className="btn-secondary btn-sm">
            <Icon name="link" className="size-4" />
            再看一次連結
          </button>
        )}
        <button {...form.triggerProps} className="btn-primary btn-sm">
          <Icon name="plus" className="size-4" />
          建立邀請連結
        </button>
      </div>
      <Dialog {...form.dialogProps} title="建立邀請連結" icon={<Icon name="link" />}>
        <form {...formProps} className="stack">
          <InviteFields modules={modules} />
          <FormFeedback state={state} />
          <FormButtons pending={pending} onCancel={form.close} label="建立邀請連結" pendingLabel="建立中…" icon="plus" />
        </form>
      </Dialog>
      <InviteLinkDialog
        id={linkDialogId}
        created={created}
        open={linkOpen}
        onClose={() => {
          setLinkOpen(false);
          reopenRef.current?.focus();
          announceOnce(announced, created?.link, () => toast.success(CLOSED_MESSAGE));
        }}
      />
    </>
  );
}

/** 開放的功能一個都沒預設 要先決定才產生連結 之後要加再到模組權限勾 */
function InviteFields({ modules }: { modules: Pick<ModuleInfo, "id" | "name" | "icon" | "accent">[] }) {
  return (
    <>
      <fieldset className="field min-w-0">
        <legend className={LEGEND_CLASS}>期限</legend>
        <div className="grid grid-cols-3 gap-2">
          {INVITE_DAY_OPTIONS.map((days) => (
            <label key={days} className="choice-card justify-center">
              <input type="radio" name="days" value={days} defaultChecked={days === 7} data-autofocus={days === 7 || undefined} className="size-4 shrink-0" />
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
      <fieldset className="field min-w-0">
        <legend className={LEGEND_CLASS}>開放哪些功能</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {modules.map((module) => (
            <label key={module.id} data-accent={module.accent} className="choice-card">
              <input type="hidden" name="allModules" value={module.id} />
              <input type="checkbox" name="modules" value={module.id} className="size-4 shrink-0" />
              <Icon src={module.icon} className="size-4 shrink-0 text-accent" />
              <span className="min-w-0 break-words">{module.name}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="field">
        <span className="field-label">備註（選填，只有你看得到）</span>
        <input name="note" maxLength={INVITE_NOTE_MAX_LENGTH} placeholder="例如：給小明" className="input" />
      </label>
    </>
  );
}

/**
 * 建立好的連結 內容跟視窗一起出現 放 live region 來不及念
 * 改用 aria-describedby 跟標題一起念
 */
export function InviteLinkDialog({ id, created, open, onClose }: { id: string; created: CreatedInvite | null; open: boolean; onClose: () => void }) {
  return (
    <Dialog id={id} open={open && created !== null} onClose={onClose} title="邀請連結已建立" icon={<Icon name="link" />} size="lg" describedBy={`${id}-summary ${id}-warning`}>
      {created?.message && (
        <FormMessage tone="success" id={`${id}-summary`} live={false}>
          {created.message}
        </FormMessage>
      )}
      {created && <InviteCreated link={created.link} warningId={`${id}-warning`} />}
    </Dialog>
  );
}

/**
 * 資料庫只存雜湊 完整連結只在建立的這一頁看得到
 * warningId 讓視窗的 aria-describedby 指向提醒
 */
function InviteCreated({ link, warningId }: { link: string; warningId?: string }) {
  return (
    <div className="notice">
      <Icon name="link" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p id={warningId} className="font-semibold">
          只在這一頁看得到，重新整理或離開就沒了
        </p>
        {/* 網址很長 單行輸入框會截掉 改用唯讀多行欄位才看得完整
            不支援 field-sizing 的瀏覽器至少三行 */}
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
