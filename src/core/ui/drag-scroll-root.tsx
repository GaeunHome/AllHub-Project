"use client";

import { useEffect } from "react";
import { attachDragScroll } from "./drag-scroll";

/** 放在 AppShell 整站只掛一次 */
export function DragScrollRoot() {
  useEffect(() => attachDragScroll(document), []);
  return null;
}
