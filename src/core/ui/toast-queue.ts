import type { FormState } from "./form-message";

// 提示視窗的佇列與倒數 不依賴 React 畫面在 toast.tsx

export type ToastTone = "success" | "warning" | "error";
/** 標題寫結果 內容寫原因 只有一句時只給標題 */
export type ToastContent = { tone: ToastTone; title: string; body?: string };
export type Toast = ToastContent & { id: number };
/** 滑鼠在上面與鍵盤焦點在裡面分開記 兩個都離開才繼續倒數 */
export type ToastHold = "hover" | "focus";

/** 多的排隊 前面的收起後才出現 */
const MAX_VISIBLE = 3;

/** 成功看一眼就好 提醒與錯誤要讀原因 */
const DURATION_MS: Record<ToastTone, number> = { success: 4000, warning: 8000, error: 8000 };

export type ToastQueue = {
  show(content: ToastContent): void;
  dismiss(id: number): void;
  hold(id: number, source: ToastHold): void;
  release(id: number, source: ToastHold): void;
  /** 畫面上的提示 沒有變動時是同一個陣列 */
  visible(): readonly Toast[];
  subscribe(listener: () => void): () => void;
};

type Shown = { toast: Toast; left: number; startedAt: number; timer: ReturnType<typeof setTimeout> | null; holds: Set<ToastHold> };

export function createToastQueue(): ToastQueue {
  let nextId = 1;
  let shown: Shown[] = [];
  const waiting: Toast[] = [];
  let snapshot: readonly Toast[] = [];
  const listeners = new Set<() => void>();

  const changed = () => {
    snapshot = shown.map((entry) => entry.toast);
    for (const listener of listeners) listener();
  };
  const find = (id: number) => shown.find((entry) => entry.toast.id === id);
  const countDown = (entry: Shown) => {
    entry.startedAt = Date.now();
    entry.timer = setTimeout(() => dismiss(entry.toast.id), entry.left);
  };
  const stop = (entry: Shown) => {
    if (!entry.timer) return;
    clearTimeout(entry.timer);
    entry.timer = null;
    entry.left -= Date.now() - entry.startedAt;
  };
  // 出現在畫面上才開始算時間
  const fill = () => {
    while (shown.length < MAX_VISIBLE && waiting.length > 0) {
      const toast = waiting.shift()!;
      const entry: Shown = { toast, left: DURATION_MS[toast.tone], startedAt: 0, timer: null, holds: new Set() };
      shown = [...shown, entry];
      countDown(entry);
    }
  };

  function dismiss(id: number) {
    const entry = find(id);
    if (!entry) return;
    stop(entry);
    shown = shown.filter((other) => other !== entry);
    fill();
    changed();
  }

  return {
    show(content) {
      waiting.push({ ...content, id: nextId++ });
      if (shown.length >= MAX_VISIBLE) return;
      fill();
      changed();
    },
    dismiss,
    hold(id, source) {
      const entry = find(id);
      if (!entry) return;
      entry.holds.add(source);
      stop(entry);
    },
    release(id, source) {
      const entry = find(id);
      if (!entry) return;
      entry.holds.delete(source);
      if (entry.holds.size === 0 && !entry.timer) countDown(entry);
    },
    visible: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

/**
 * Server Action 的結果 錯誤用錯誤的樣子 成功用伺服器的訊息
 * 伺服器沒給訊息時用 fallback 都沒有就不跳
 */
export function resultToast(state: FormState, fallback?: string): ToastContent | null {
  if (state.error) return { tone: "error", title: state.error };
  const message = state.message ?? fallback;
  return message ? { tone: "success", title: message } : null;
}

export type ToastApi = {
  success(title: string, body?: string): void;
  warning(title: string, body?: string): void;
  error(title: string, body?: string): void;
  /** Server Action 的結果 沒有訊息時用 fallback */
  result(state: FormState, fallback?: string): void;
};

type ToastOptions = {
  /** 伺服器沒給訊息時成功了用這句 例如刪除後這一列跟著不見 */
  fallback?: string;
  /** false 時錯誤留給表單自己顯示 使用者要對著欄位修改 */
  errors?: boolean;
};

/**
 * 包住 Server Action 結果回來就跳提示
 * 那一列可能在同一次更新就不見 effect 來不及跑 所以不等畫面
 */
export function withToast<S extends FormState, A extends unknown[]>(toast: ToastApi, action: (...args: A) => Promise<S>, { fallback, errors = true }: ToastOptions = {}) {
  return async (...args: A): Promise<S> => {
    const result = await action(...args);
    if (errors || !result.error) toast.result(result, fallback);
    return result;
  };
}

/** 元件用的提示 測試的替身也用它 */
export function createToastApi(show: (content: ToastContent) => void): ToastApi {
  const of = (tone: ToastTone) => (title: string, body?: string) => show(body ? { tone, title, body } : { tone, title });
  return {
    success: of("success"),
    warning: of("warning"),
    error: of("error"),
    result(state, fallback) {
      const content = resultToast(state, fallback);
      if (content) show(content);
    },
  };
}
