"use client";

import { useLinkStatus } from "next/link";

/** 點了城市還沒換好時先亮起來 樣式用 :has() 看這個標記 不佔版面 */
export function PendingPlace() {
  const { pending } = useLinkStatus();
  return pending ? <span hidden data-pending="" /> : null;
}
