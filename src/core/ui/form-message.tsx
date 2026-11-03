import type { ReactNode } from "react";
import { Icon } from "./icon";

/** Server Action 回給表單的結果 */
export type FormState = { error?: string; message?: string };

type FormMessageProps = {
  tone: "error" | "success";
  children: ReactNode;
  /** 讓彈出視窗的 aria-describedby 指向 */
  id?: string;
  /** 跟視窗一起出現的說明設 false 改由 aria-describedby 念 不然會念兩次 */
  live?: boolean;
};

// 錯誤用 alert 立刻念 成功用 status 等報讀器念完手上的內容
export function FormMessage({ tone, children, id, live = true }: FormMessageProps) {
  const error = tone === "error";
  return (
    <p
      id={id}
      role={live ? (error ? "alert" : "status") : undefined}
      className={error ? "form-message form-message-error" : "form-message form-message-success"}
    >
      <Icon name={error ? "circle-alert" : "circle-check"} />
      <span>{children}</span>
    </p>
  );
}

/** 表單下方的錯誤 使用者要對著欄位修改 成功的訊息用提示視窗 */
export function FormFeedback({ state }: { state: FormState }) {
  return state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null;
}
