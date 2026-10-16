"use client";

import { createContext, startTransition, useActionState, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useReducer, useRef, useState, type FormEvent, type ReactNode, type RefObject } from "react";
import { FormMessage, type FormState } from "./form-message";
import { Icon } from "./icon";
import { CardHeader } from "./page-header";

export type DialogSize = "sm" | "md" | "lg" | "full";

type DialogCommon = {
  open: boolean;
  /** 按 Esc 點背景 按 X 或頁面藏起來 卸載時呼叫 外層把 open 改回 false */
  onClose: () => void;
  /** 打開它的按鈕在關掉時已經不見了 焦點改放到這裡 不掉到 body */
  fallbackFocus?: RefObject<HTMLElement | null>;
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
 * 打開它的按鈕不見了改放到備援的位置
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
  const { open, onClose, fallbackFocus, size = "md", className = "", id, describedBy, children } = props;
  const ref = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const pointerDown = useRef<EventTarget | null>(null);
  const titleId = useId();

  // 在繪製前開關 收起時才不會先閃一下空白的視窗
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return;
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // 收起 卸載或 Activity 藏起頁面時都會跑清除函式
    // 開著的 modal 會讓整份文件不能操作
    return showDialog(dialog);
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
        returnFocusTarget(focusLost, trigger, fallbackFocus?.current ?? null)?.focus();
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

type DialogState = { open: boolean; message?: string };
type DialogEvent = { type: "open" } | { type: "done"; message?: string } | { type: "close" };

/** 打開時清掉上次的訊息 done 關掉並留下這次的訊息 close 只關掉 */
export function dialogReducer(state: DialogState, event: DialogEvent): DialogState {
  switch (event.type) {
    case "open":
      return { open: true, message: undefined };
    case "done":
      return { open: false, message: event.message };
    case "close":
      return { ...state, open: false };
  }
}

type MessageScope = { latest: string | null };
const MessageScopeContext = createContext<(MessageScope & { claim: (id: string) => void }) | null>(null);

/** 在 DialogMessageScope 裡只顯示最新一則 別的視窗後來成功了舊的就收起 */
export function shownMessage(message: string | undefined, id: string, scope: MessageScope | null): string | undefined {
  if (!scope) return message;
  return scope.latest === id ? message : undefined;
}

/**
 * 一頁有很多會留訊息的視窗時包在外面 只留最新一則
 * 訊息才不會越積越多 留著過期的金額
 */
export function DialogMessageScope({ children }: { children: ReactNode }) {
  const [latest, setLatest] = useState<string | null>(null);
  // Activity 藏起頁面時清掉 回到這一頁才不會看到上次的訊息
  useLayoutEffect(() => () => setLatest(null), []);
  const scope = useMemo(() => ({ latest, claim: setLatest }), [latest]);
  return <MessageScopeContext value={scope}>{children}</MessageScopeContext>;
}

/**
 * 按鈕打開視窗 成功後關掉並把訊息留在原位
 * 按鈕與訊息要自己排版時用這個 配 Dialog 與 DialogMessage
 */
export function useDialog() {
  const [state, dispatch] = useReducer(dialogReducer, { open: false });
  const id = useId();
  const scope = useContext(MessageScopeContext);
  const messageRef = useRef<HTMLParagraphElement>(null);
  const close = () => dispatch({ type: "close" });
  const message = shownMessage(state.message, id, scope);
  // 按鈕可能在視窗關掉後才被拿掉 焦點在它上面時改放到成功訊息
  // 要固定同一個函式 重新算繪時才不會被當成拿掉
  const triggerRef = useCallback((node: HTMLElement | null) => {
    if (!node) return;
    return () => returnFocusTarget(document.activeElement === node, null, messageRef.current)?.focus();
  }, []);

  return {
    open: state.open,
    /** 上一次成功的訊息 再打開視窗時清掉 */
    message,
    /** 展開在打開視窗的按鈕上 */
    triggerProps: {
      ref: triggerRef,
      type: "button",
      "aria-haspopup": "dialog",
      "aria-expanded": state.open,
      "aria-controls": id,
      onClick: () => dispatch({ type: "open" }),
    } as const,
    /** 展開在 Dialog 上 按鈕不見時焦點改放到成功訊息 */
    dialogProps: { id, open: state.open, onClose: close, fallbackFocus: messageRef },
    /** 展開在 DialogMessage 上 */
    messageProps: { message, ref: messageRef },
    close,
    /** 表單成功時呼叫 關掉視窗並留下訊息 */
    done: (text?: string) => {
      dispatch({ type: "done", message: text });
      if (text) scope?.claim(id);
    },
  };
}

/**
 * 視窗成功後留下的訊息 有圖示與底色比小字醒目 按鈕不見時焦點落在這裡
 * className 給外面包的一層 例如在一排按鈕裡獨佔最後一整列
 */
export function DialogMessage({ message, ref, className }: { message?: string; ref?: RefObject<HTMLParagraphElement | null>; className?: string }) {
  if (!message) return null;
  const content = (
    <FormMessage tone="success" ref={ref}>
      {message}
    </FormMessage>
  );
  return className ? <div className={className}>{content}</div> : content;
}

type FormAction<S extends FormState> = (previous: S, formData: FormData) => Promise<S>;
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
  // 結果是一般物件 Awaited<S> 就是 S 泛型時 TypeScript 看不出來
  const run = dialogFormAction(action, onDone, isDone) as (previous: Awaited<S>, formData: FormData) => Promise<S>;
  const [state, dispatch, pending] = useActionState<S, FormData>(run, {} as Awaited<S>);

  // 送出時按鈕停用 焦點會掉到視窗外的 body 失敗時放回欄位馬上可以改
  useEffect(() => {
    if (state.error) formRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
  }, [state]);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    // 不用 form 的 action 因為 React 送完一定清空欄位 失敗時打的字會不見
    event.preventDefault();
    const formData = new FormData(event.currentTarget, (event.nativeEvent as SubmitEvent).submitter);
    startTransition(() => dispatch(formData));
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
  /** 給成功訊息外面那一層 例如在一排按鈕裡獨佔最後一整列 */
  messageClassName?: string;
  /** 傳函式就拿得到 done 與 close 成功時訊息接在按鈕後面 */
  children: ReactNode | ((controls: DialogControls) => ReactNode);
};

/**
 * 一個按鈕加上它打開的視窗 成功訊息接在按鈕後面
 * 清單列裡的表單與詳情用這個 不要展開在列裡
 */
export function DialogButton({ label, buttonClassName = "btn-secondary", title, icon, size, className, messageClassName, children }: DialogButtonProps) {
  const dialog = useDialog();

  return (
    <>
      <button {...dialog.triggerProps} className={buttonClassName}>
        {label}
      </button>
      <DialogMessage {...dialog.messageProps} className={messageClassName} />
      <Dialog {...dialog.dialogProps} title={title} icon={icon} size={size} className={className}>
        {dialog.open && (typeof children === "function" ? children({ done: dialog.done, close: dialog.close }) : children)}
      </Dialog>
    </>
  );
}
