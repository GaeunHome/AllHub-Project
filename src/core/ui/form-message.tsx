import type { ReactNode } from "react";
import { Icon } from "./icon";

/** Server Action 回給表單的結果 */
export type FormState = { error?: string; message?: string };

type FormMessageProps = { tone: "error" | "success"; children: ReactNode };

// 錯誤用 alert 立刻念出來，成功用 status 等報讀器念完手上的內容
export function FormMessage({ tone, children }: FormMessageProps) {
  const error = tone === "error";
  return (
    <p role={error ? "alert" : "status"} className={error ? "form-message form-message-error" : "form-message form-message-success"}>
      <Icon name={error ? "circle-alert" : "circle-check"} />
      <span>{children}</span>
    </p>
  );
}

export function FormFeedback({ state }: { state: FormState }) {
  if (state.error) return <FormMessage tone="error">{state.error}</FormMessage>;
  if (state.message) return <FormMessage tone="success">{state.message}</FormMessage>;
  return null;
}

/** 按鈕旁的小字回饋（FormFeedback 的精簡版）；只想顯示錯誤時不傳 message。className 用來調整寬度與對齊 */
export function InlineFeedback({ error, message, className = "" }: FormState & { className?: string }) {
  if (error) {
    return (
      <span role="alert" className={`text-xs text-danger ${className}`}>
        {error}
      </span>
    );
  }
  if (message) {
    return (
      <span role="status" className={`text-xs text-success ${className}`}>
        {message}
      </span>
    );
  }
  return null;
}
