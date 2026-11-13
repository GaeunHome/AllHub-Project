"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Dialog, useDialog } from "@/core/ui/dialog";
import { Icon } from "@/core/ui/icon";
import { useToast } from "@/core/ui/toast";
import type { LinkState } from "../actions";
import { accountHref } from "../../lib/urls";
import { BoardingPass } from "./boarding-pass";
import { CookieLinkForm, type Handoff } from "./cookie-link-form";
import { LoginLinkForm } from "./login-link-form";

/**
 * 使用者選的 登入用彈出視窗 樣子是星穹列車的乘車證
 * 還沒連結時是一張大卡片加按鈕 已有帳號時只是一個按鈕 打開的是同一個視窗
 */
export function LinkAccountForm({ variant }: { variant: "hero" | "button" }) {
  const dialog = useDialog();
  const titleId = useId();
  const heroId = useId();

  return (
    <>
      {variant === "hero" ? (
        <section aria-labelledby={heroId} className="sr-panel flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:p-8">
          <span className="sr-pass-emblem size-14" aria-hidden>
            <Icon name="train-front" className="size-7" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <h3 id={heroId} className="text-xl font-semibold text-ink">
              連結 HoYoLAB 帳號
            </h3>
            <p className="text-ink">用 HoYoverse 帳號登入，就能看到開拓力、角色與戰績；登入過期時會自動換新。</p>
          </div>
          <button {...dialog.triggerProps} className="btn-primary sr-pass-cta self-start sm:self-center">
            <Icon name="link" className="size-4" />
            連結帳號
          </button>
        </section>
      ) : (
        <div className="button-row">
          <button {...dialog.triggerProps} className="btn-secondary">
            <Icon name="key-round" className="size-4 text-sr-gold" />
            新增帳號或更新 cookie
          </button>
        </div>
      )}
      {/* sr-dialog 是星空底 票根與標題由乘車證自己畫 連結好了就關掉 結果用提示視窗 */}
      <Dialog {...dialog.dialogProps} bare labelledBy={titleId} size="lg" className="sr-dialog sr-pass-dialog">
        <BoardingPass titleId={titleId} onClose={dialog.close}>
          <LinkAccountFields onLinked={() => dialog.done()} />
        </BoardingPass>
      </Dialog>
    </>
  );
}

type Mode = "login" | "cookie";

/**
 * 使用者要的 盡可能不用重貼 cookie 預設用帳號密碼登入
 * 貼 cookie 是下方的小連結 HoYoverse 改版讓登入失效時照常能用
 */
export function LinkAccountFields({ onLinked }: { onLinked?: () => void }) {
  const [mode, setMode] = useState<Mode>("login");
  const [handoff, setHandoff] = useState<Handoff | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const onDone = useLinkedDone(onLinked);

  // 換了表單 按下的連結或按鈕跟著不見 焦點放到新表單的第一個欄位
  const show = (change: () => void) => {
    flushSync(change);
    box.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
  };

  return (
    <div ref={box} className="stack">
      {handoff ? (
        <CookieLinkForm onDone={onDone} handoff={handoff} onBack={() => show(() => setHandoff(null))} />
      ) : (
        <>
          {mode === "login" ? <LoginLinkForm onRoles={(roles, cookie) => show(() => setHandoff({ roles, cookie }))} onDone={onDone} /> : <CookieLinkForm onDone={onDone} />}
          <button type="button" onClick={() => show(() => setMode(mode === "login" ? "cookie" : "login"))} className="sr-pass-switch">
            {mode === "login" ? "登不進去？改用貼上 cookie" : "改回帳號密碼登入"}
            <Icon name="chevron-right" className="size-4" />
          </button>
        </>
      )}
    </div>
  );
}

/** 連結好了 關掉視窗 結果用提示視窗 導向剛連結的帳號 */
function useLinkedDone(onLinked?: () => void) {
  const router = useRouter();
  const toast = useToast();
  return (message: string | undefined, result: LinkState) => {
    onLinked?.();
    if (result.accountId === undefined) return;
    toast.success(message ?? "已連結帳號");
    if (result.warning) toast.warning(result.warning);
    // 捲回最上面 看得到剛連結的帳號
    router.push(accountHref(result.accountId));
  };
}
