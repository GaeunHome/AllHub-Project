// 放進 top layer 外層有 filter 或容器查詢時 fixed 才不會被關在裡面
// 不支援 popover 的瀏覽器靠 z-index

type Layer = Pick<HTMLElement, "matches"> & Partial<Pick<HTMLElement, "showPopover" | "hidePopover">>;

/** 已經顯示的不重放 重放會排到最上面 */
export function showOnTop(layer: Layer | null): void {
  if (layer && typeof layer.showPopover === "function" && !layer.matches(":popover-open")) layer.showPopover();
}

export function hideFromTop(layer: Layer | null): void {
  if (layer && typeof layer.hidePopover === "function" && layer.matches(":popover-open")) layer.hidePopover();
}
