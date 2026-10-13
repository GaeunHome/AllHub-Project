import type { ReactNode, Ref } from "react";
import { Icon } from "./icon";

/** Server Action 回給表單的結果 */
export type FormState = { error?: string; message?: string };

type FormMessageProps = {
  tone: "error" | "success";
  children: ReactNode;
  /** 給了就能用程式把焦點放上來（例如視窗關掉後原本的按鈕不見了） */
  ref?: Ref<HTMLParagraphElement>;
  /** 讓彈出視窗的 aria-describedby 指向 */
  id?: string;
  /** false：跟彈出視窗一起出現的說明，改由視窗的 aria-describedby 念；再當 live region 會念兩次 */
  live?: boolean;
};

// 錯誤用 alert 立刻念出來，成功用 status 等報讀器念完手上的內容
export function FormMessage({ tone, children, ref, id, live = true }: FormMessageProps) {
  const error = tone === "error";
  return (
    <p
      ref={ref}
      id={id}
      tabIndex={ref ? -1 : undefined}
      role={live ? (error ? "alert" : "status") : undefined}
      className={error ? "form-message form-message-error" : "form-message form-message-success"}
    >
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

/** 點了之後要讓人一眼看到的結果（兌換碼、立即簽到、連結帳號）：比 FormFeedback 大一級，有標題；一般表單仍用 FormFeedback。warning 是成功了但有要注意的地方 */
export function ResultBanner({ tone, title, children }: { tone: "error" | "success" | "warning"; title: ReactNode; children?: ReactNode }) {
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`result-banner result-banner-${tone}`}>
      <Icon name={tone === "success" ? "circle-check" : "circle-alert"} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="result-banner-title">{title}</p>
        {children && <div className="text-sm break-words text-ink">{children}</div>}
      </div>
    </div>
  );
}
