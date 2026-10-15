// 圓餅圖的片與圖例按鈕共用這份狀態 不依賴 React 才能單獨測

export type ChartFocus = { hover: string | null; focus: string | null };

export type ChartFocusEvent = { type: "hover" | "unhover" | "focus" | "blur"; key: string } | { type: "reset" };

export const NO_FOCUS: ChartFocus = { hover: null, focus: null };

export function chartFocusReducer(state: ChartFocus, event: ChartFocusEvent): ChartFocus {
  switch (event.type) {
    case "hover":
      return state.hover === event.key ? state : { ...state, hover: event.key };
    case "focus":
      return state.focus === event.key ? state : { ...state, focus: event.key };
    // 先進入下一列才離開上一列時 不能把新的清掉
    case "unhover":
      return state.hover === event.key ? { ...state, hover: null } : state;
    case "blur":
      return state.focus === event.key ? { ...state, focus: null } : state;
    case "reset":
      return state.hover === null && state.focus === null ? state : NO_FOCUS;
  }
}

/** 滑過優先 其次是鍵盤焦點 再來是點選 剛切換分組時不在這組的 key 當作沒有 */
export function activeKey(state: ChartFocus, selected: string | null, keys: readonly string[]): string | null {
  return [state.hover, state.focus, selected].find((key): key is string => key !== null && keys.includes(key)) ?? null;
}

export function toggleSelection(selected: string | null, key: string): string | null {
  return selected === key ? null : key;
}
