"use client";

import { useLayoutEffect, useRef, useState, type ComponentProps } from "react";
import { entranceMemory } from "./entrance";

/** Activity 藏起頁面時把播過的動畫標起來 回來時才不重播 見 entrance.ts */
export function EntranceScope(props: ComponentProps<"div">) {
  const ref = useRef<HTMLDivElement>(null);
  const [memory] = useState(() => entranceMemory({ set: (callback) => window.setTimeout(callback), clear: (id) => window.clearTimeout(id) }));

  // 用 layout effect 藏起來那次更新就排好標記 再顯示時第一次繪製前已經標好
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    memory.mount();
    return () => memory.hide(root);
  }, [memory]);

  return <div {...props} ref={ref} />;
}
