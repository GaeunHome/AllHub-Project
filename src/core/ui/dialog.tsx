"use client";

import { startTransition, useActionState, useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { focusFrameIfLost, framesOf, keepFocusInFrame } from "./focus-frame";
import type { FormState } from "./form-message";
import { Icon } from "./icon";
import { CardHeader } from "./page-header";
import { useToast } from "./toast";
import { placeToastLayer } from "./toast-layer";

export type DialogSize = "sm" | "md" | "lg" | "full";

type DialogCommon = {
  open: boolean;
  /** 按 Esc 點背景 按 X 或頁面藏起來 卸載時呼叫 外層把 open 改回 false */
  onClose: () => void;
  /**
   * sm 24rem md 32rem lg 44rem 手機撐滿寬度從底部升起
   * full 是滿版的大面板 只給內容多又要大圖的詳情
   */
  size?: DialogSize;
  /** 加在 dialog 上 例如星穹鐵道的 sr-dialog 配色跟著頁面主題 不必再掛主題 class */
  className?: string;
  id?: string;
  /** 說明的 id 用空白分隔 打開時報讀器連同標題一起念 放 live region 會來不及念 */
  describedBy?: string;
  children: ReactNode;
};

type DialogProps = DialogCommon &
  (
    | { title: ReactNode; icon?: ReactNode; bare?: false; labelledBy?: never }
    | { /** 不畫標題列與內距 內容自己帶標題與關閉按鈕 標題的 id 給 labelledBy */ bare: true; labelledBy: string; title?: never; icon?: never }
  );

const SIZE_CLASS: Record<DialogSize, string> = { sm: "dialog-sm", md: "dialog-md", lg: "dialog-lg", full: "dialog-full" };

/** 按下與放開都落在 dialog 本身才算點背景 選取文字拖到外面才不會關掉視窗 */
export function isBackdropClick(downTarget: EventTarget | null, clickTarget: EventTarget | null, dialog: EventTarget | null): boolean {
  return downTarget !== null && downTarget === dialog && clickTarget === dialog;
}

/**
 * 關掉視窗後焦點回到哪裡 已經被別的元件接走就不搶
 * 打開它的按鈕不見了改放到打開時它所在的外框
 */
export function returnFocusTarget<T extends { isConnected: boolean }>(focusLost: boolean, trigger: T | null, fallback: T | null): T | null {
  if (!focusLost) return null;
  if (trigger?.isConnected) return trigger;
  return fallback?.isConnected ? fallback : null;
}

/** 用 showModal 打開並把焦點交給 data-autofocus 的欄位 回傳關掉它的函式 */
export function showDialog(dialog: HTMLDialogElement): () => void {
  // 已經開著時再呼叫 showModal 會丟錯
  if (!dialog.open) {
    dialog.showModal();
    // React 的 autoFocus 在 dialog 還藏著時就跑完了 打開後再把焦點交給標記的欄位
    dialog.querySelector<HTMLElement>("[data-autofocus]")?.focus();
  }
  return () => dialog.close();
}

/** 用原生 dialog 的 showModal 焦點鎖在裡面 背景不能點 關閉後焦點回到按鈕 */
export function Dialog(props: DialogProps) {
  const { open, onClose, size = "md", className = "", id, describedBy, children } = props;
  const ref = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const returnFrames = useRef<HTMLElement[]>([]);
  const pointerDown = useRef<EventTarget | null>(null);
  const titleId = useId();

  // 在繪製前開關 收起時才不會先閃一下空白的視窗
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // 按鈕之後可能不見 先記下它外面的外框
    const frames = framesOf(trigger);
    returnFocus.current = trigger;
    returnFrames.current = frames;
    const close = showDialog(dialog);
    // 提示視窗跟著搬進這個視窗 蓋在上面也點得到
    placeToastLayer();
    // 收起 卸載或 Activity 藏起頁面時都會跑清除函式
    // 開著的 modal 會讓整份文件不能操作
    return () => {
      close();
      placeToastLayer();
      // 整列連同視窗一起拿掉時 瀏覽器還焦點的那個按鈕也跟著不見
      focusFrameIfLost(frames);
    };
  }, [open]);

  const close = () => ref.current?.close();
  const labelledBy = props.bare ? props.labelledBy : titleId;

  return (
    <dialog
      ref={ref}
      id={id}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      className={`dialog ${SIZE_CLASS[size]} ${className}`.trim()}
      onClose={(event) => {
        const dialog = event.currentTarget;
        // close 事件是非同步的 StrictMode 先卸載再掛上 舊事件晚到時視窗已經又打開了
        if (dialog.open) return;
        const trigger = returnFocus.current;
        returnFocus.current = null;
        // 瀏覽器會把焦點還給按鈕 按鈕不見了焦點就留在 body 或藏起來的視窗裡
        const active = document.activeElement;
        const focusLost = !active || active === document.body || dialog.contains(active);
        const frame = returnFrames.current.find((candidate) => candidate.isConnected) ?? null;
        returnFocusTarget(focusLost, trigger, frame)?.focus({ preventScroll: true });
        onClose();
      }}
      onPointerDown={(event) => {
        pointerDown.current = event.target;
      }}
      onClick={(event) => {
        const backdrop = isBackdropClick(pointerDown.current, event.target, event.currentTarget);
        pointerDown.current = null;
        if (backdrop) close();
      }}
    >
      {open && !props.bare && (
        <div className="dialog-header">
          <CardHeader
            id={titleId}
            icon={props.icon}
            actions={
              <button type="button" onClick={close} aria-label="關閉" className="btn-ghost btn-sm btn-icon">
                <Icon name="x" className="size-4" />
              </button>
            }
          >
            {props.title}
          </CardHeader>
        </div>
      )}
      {open && <div className={props.bare ? "dialog-body dialog-body-bare" : "dialog-body"}>{children}</div>}
    </dialog>
  );
}

/**
 * 按鈕打開視窗 按鈕與視窗要自己排版時用這個 配 Dialog
 * 成功的訊息用提示視窗 不留在頁面上
 */
export function useDialog() {
  const [open, setOpen] = useState(false);
  const id = useId();
  const toast = useToast();
  const close = () => setOpen(false);

  return {
    open,
    /** 展開在打開視窗的按鈕上 按鈕之後不見時焦點交給外框 */
    triggerProps: {
      ref: keepFocusInFrame,
      type: "button",
      "aria-haspopup": "dialog",
      "aria-expanded": open,
      "aria-controls": id,
      onClick: () => setOpen(true),
    } as const,
    /** 展開在 Dialog 上 */
    dialogProps: { id, open, onClose: close },
    close,
    /** 表單成功時呼叫 關掉視窗再跳提示 */
    done: (message?: string) => {
      // 先關掉 提示的外層才搬回頁面 不會在視窗裡出現一下又搬走
      flushSync(close);
      if (message) toast.success(message);
    },
  };
}

type FormAction<S extends FormState> = (previous: S, formData: FormData) => Promise<S>;
/** 送出時順便記下表單外面的外框 成功後表單不見時焦點才有地方去 */
type Submission = { formData: FormData; frames: HTMLElement[] };
type OnDone<S extends FormState> = (message: string | undefined, result: S) => void;
const succeeded = (result: FormState) => !result.error;

/**
 * 包住視窗裡表單的 Server Action 完成了才交給 onDone 關掉視窗
 * 預設沒有錯誤就算完成 有下一步的表單自己判斷
 */
export function dialogFormAction<S extends FormState>(action: FormAction<S>, onDone: OnDone<S>, isDone: (result: S) => boolean = succeeded): FormAction<S> {
  return async (previous, formData) => {
    const result = await action(previous, formData);
    if (isDone(result)) onDone(result.message, result);
    return result;
  };
}

/**
 * 失敗時留在視窗裡 保留打的字並把焦點放回 data-autofocus 的欄位
 * 有下一步的表單傳 isDone
 */
export function useDialogForm<S extends FormState>(action: FormAction<S>, onDone: OnDone<S>, isDone?: (result: S) => boolean) {
  const formRef = useRef<HTMLFormElement>(null);
  const run = (previous: S, { formData, frames }: Submission) => {
    const finish: OnDone<S> = (message, result) => {
      onDone(message, result);
      focusFrameIfLost(frames);
    };
    return dialogFormAction(action, finish, isDone)(previous, formData);
  };
  // 結果是一般物件 Awaited<S> 就是 S 泛型時 TypeScript 看不出來
  const [state, dispatch, pending] = useActionState<S, Submission>(run as (previous: Awaited<S>, submission: Submission) => Promise<S>, {} as Awaited<S>);

  // 送出時按鈕停用 焦點會掉到視窗外的 body 失敗時放回欄位馬上可以改
  useEffect(() => {
    if (state.error) formRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
  }, [state]);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    // 不用 form 的 action 因為 React 送完一定清空欄位 失敗時打的字會不見
    event.preventDefault();
    const formData = new FormData(event.currentTarget, (event.nativeEvent as SubmitEvent).submitter);
    // 放在頁面上的表單成功後可能整個被換掉 例如還沒有帳號時的連結表單 先記下外框
    const frames = framesOf(event.currentTarget);
    startTransition(() => dispatch({ formData, frames }));
  };

  return { state, pending, formProps: { ref: formRef, onSubmit } };
}

type DialogControls = Pick<ReturnType<typeof useDialog>, "done" | "close">;

type DialogButtonProps = {
  /** 按鈕上的內容 */
  label: ReactNode;
  buttonClassName?: string;
  title: ReactNode;
  icon?: ReactNode;
  size?: DialogSize;
  className?: string;
  /** 傳函式就拿得到 done 與 close */
  children: ReactNode | ((controls: DialogControls) => ReactNode);
};

/**
 * 一個按鈕加上它打開的視窗 成功的訊息用提示視窗
 * 清單列裡的表單與詳情用這個 不要展開在列裡
 */
export function DialogButton({ label, buttonClassName = "btn-secondary", title, icon, size, className, children }: DialogButtonProps) {
  const dialog = useDialog();

  return (
    <>
      <button {...dialog.triggerProps} className={buttonClassName}>
        {label}
      </button>
      <Dialog {...dialog.dialogProps} title={title} icon={icon} size={size} className={className}>
        {dialog.open && (typeof children === "function" ? children({ done: dialog.done, close: dialog.close }) : children)}
      </Dialog>
    </>
  );
}
