"use client";

import { useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { useDialogForm } from "../ui/dialog";
import { FormButtons } from "../ui/form-buttons";
import { FormFeedback, type FormState } from "../ui/form-message";
import { uploadAvatarAction } from "./actions";
import { drawAvatar, shrinkAvatar } from "./avatar-image";
import { AVATAR_MAX_ZOOM, avatarZoom, centerSquare, panCrop, zoomCrop } from "./avatar-rules";

// 預覽最大 18rem 畫大一倍 高解析度的螢幕才不會糊
const PREVIEW_PIXELS = 576;
/** 方向鍵每按一次移動裁切範圍的 5% */
const KEY_STEP = 0.05;
const ARROWS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

type AvatarCropperProps = { bitmap: ImageBitmap; onDone: (message: string | undefined) => void; onCancel: () => void };

/** 使用者要的 用一個視窗調整 拖曳移動 滑桿放大縮小 圓框裡看到的就是存下來的 */
export function AvatarCropper({ bitmap, onDone, onCancel }: AvatarCropperProps) {
  const { width, height } = bitmap;
  const [crop, setCrop] = useState(() => centerSquare(width, height));
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    if (canvasRef.current) drawAvatar(canvasRef.current, bitmap, crop);
  }, [bitmap, crop]);

  const upload = async (state: FormState): Promise<FormState> => {
    const form = new FormData();
    form.set("photo", await shrinkAvatar(bitmap, crop), "avatar.jpg");
    return uploadAvatarAction(state, form);
  };
  const { state, pending, formProps } = useDialogForm(upload, onDone);

  const startDrag = (event: PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY };
  };
  const moveDrag = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!drag.current) return;
    // 手指往右 照片跟著往右 所以裁切範圍往左 螢幕的距離要換成原圖的像素
    const scale = crop.side / event.currentTarget.clientWidth;
    const dx = (drag.current.x - event.clientX) * scale;
    const dy = (drag.current.y - event.clientY) * scale;
    drag.current = { x: event.clientX, y: event.clientY };
    setCrop((current) => panCrop(width, height, current, dx, dy));
  };
  const endDrag = () => {
    drag.current = null;
  };
  const moveByKey = (event: KeyboardEvent<HTMLCanvasElement>) => {
    const arrow = ARROWS[event.key];
    if (!arrow) return;
    event.preventDefault();
    const step = crop.side * KEY_STEP;
    setCrop((current) => panCrop(width, height, current, arrow[0] * step, arrow[1] * step));
  };

  return (
    <form {...formProps} className="stack">
      <div className="avatar-crop">
        <canvas
          ref={canvasRef}
          width={PREVIEW_PIXELS}
          height={PREVIEW_PIXELS}
          tabIndex={0}
          aria-label="頭像預覽：拖曳或用方向鍵移動照片"
          data-autofocus=""
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={moveByKey}
        />
      </div>
      <div className="field">
        <label htmlFor="avatar-zoom" className="field-label">
          放大縮小
        </label>
        <input
          id="avatar-zoom"
          type="range"
          min={1}
          max={AVATAR_MAX_ZOOM}
          step={0.01}
          value={avatarZoom(width, height, crop)}
          onChange={(event) => setCrop((current) => zoomCrop(width, height, current, Number(event.target.value)))}
          className="avatar-crop-zoom"
        />
      </div>
      {!pending && <FormFeedback state={{ error: state.error }} />}
      <FormButtons pending={pending} onCancel={onCancel} label="上傳" pendingLabel="上傳中…" icon="upload" />
    </form>
  );
}
