import { showOnTop } from "./top-layer";

// 外層用 popover 放進 top layer 才蓋得過彈出視窗
// modal 開著時外面點不到 所以搬進最上面開著的視窗

let current: HTMLElement | null = null;

/** ToastProvider 掛上時登記 回傳拿掉它的函式 */
export function attachToastLayer(layer: HTMLElement, doc: Document = document): () => void {
  current = layer;
  placeToastLayer(doc);
  return () => {
    if (current === layer) current = null;
    layer.remove();
  };
}

/** 視窗打開或關掉時呼叫 搬到最上面那個開著的視窗 沒有就是 body */
export function placeToastLayer(doc: Document = document): void {
  const layer = current;
  if (!layer) return;
  const open = doc.querySelectorAll("dialog[open]");
  const parent = open.length > 0 ? open[open.length - 1] : doc.body;
  if (layer.parentNode !== parent) parent.append(layer);
  // 搬家時瀏覽器會先收起 重新顯示才排到最上層
  showOnTop(layer);
}
