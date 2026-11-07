"use client";

import Image from "next/image";
import { useId, useState, type ChangeEvent } from "react";
import { AVATAR_IDS, avatarName, avatarOf, avatarSrc, avatarUrl } from "../avatars";
import { DialogButton, useDialogForm } from "../ui/dialog";
import { FormButtons } from "../ui/form-buttons";
import { FormFeedback } from "../ui/form-message";
import { Icon } from "../ui/icon";
import { InfoTip } from "../ui/info-tip";
import { UserAvatar } from "../ui/user-avatar";
import { updateAvatarAction } from "./actions";
import { AvatarCropper } from "./avatar-cropper";
import { KEEP_AVATAR, avatarFileProblem } from "./avatar-rules";

type AvatarProps = { username: string; name: string; avatar: string | null };
type DoneProps = { onDone: (message: string | undefined) => void };

/** 跟修改暱稱排在一起 存好後關掉視窗 結果用提示視窗 */
export function AvatarButton(props: AvatarProps) {
  return (
    <DialogButton
      label={
        <>
          <Icon name="pencil" className="size-4" />
          更換頭像
        </>
      }
      title="更換頭像"
    >
      {({ done, close }) => <AvatarChoices {...props} onDone={done} onCancel={close} />}
    </DialogButton>
  );
}

/** 選了照片就在同一個視窗裡調整 取消回到選頭像 */
function AvatarChoices({ onDone, onCancel, ...props }: AvatarProps & DoneProps & { onCancel: () => void }) {
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  if (bitmap) return <AvatarCropper bitmap={bitmap} onDone={onDone} onCancel={() => setBitmap(null)} />;
  return (
    <div className="stack">
      <PhotoPicker onPicked={setBitmap} />
      <AvatarForm {...props} onDone={onDone} onCancel={onCancel} />
    </div>
  );
}

/** 瀏覽器先解開照片才看得到預覽 手機的 HEIC 這類解不開的在這裡就擋下 */
function PhotoPicker({ onPicked }: { onPicked: (bitmap: ImageBitmap) => void }) {
  const inputId = useId();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pick = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const problem = avatarFileProblem(file);
    setError(problem);
    if (problem) return;
    setBusy(true);
    try {
      onPicked(await createImageBitmap(file));
    } catch {
      setError("這張照片無法讀取，請換一張");
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1">
        <label htmlFor={inputId} aria-disabled={busy} className="btn-secondary w-fit cursor-pointer has-[:focus-visible]:outline-2">
          <Icon name="upload" className="size-4" />
          {busy ? "讀取中…" : "上傳照片"}
          <input id={inputId} type="file" accept="image/*" disabled={busy} onChange={pick} className="sr-only" />
        </label>
        <InfoTip label="上傳照片的說明">檔案最大 5MB，選好後可以拖曳與縮放</InfoTip>
      </div>
      {error && <FormFeedback state={{ error }} />}
    </div>
  );
}

type AvatarFormProps = AvatarProps & DoneProps & { onCancel: () => void };

function AvatarForm({ username, name, avatar, onDone, onCancel }: AvatarFormProps) {
  const { state, pending, formProps } = useDialogForm(updateAvatarAction, onDone);
  const current = avatarOf(avatar);
  const url = avatarUrl(avatar);
  // 上傳的照片不在範例裡 要多一格 不然打開就變成選了文字頭像
  const uploaded = current === null ? url : null;

  return (
    <form {...formProps} className="stack">
      <fieldset className="grid grid-cols-4 gap-3 sm:grid-cols-6">
        <legend className="sr-only">選一個頭像</legend>
        {uploaded && (
          <label className="avatar-choice">
            <input type="radio" name="avatar" value={KEEP_AVATAR} defaultChecked data-autofocus="" className="sr-only" />
            <Image src={uploaded} alt="" width={48} height={48} unoptimized className="user-avatar-image size-12" />
            <span className="sr-only">目前的照片</span>
          </label>
        )}
        <label className="avatar-choice">
          <input type="radio" name="avatar" value="" defaultChecked={url === null} data-autofocus={url === null ? "" : undefined} className="sr-only" />
          <UserAvatar username={username} name={name} size="md" />
          <span className="sr-only">文字頭像</span>
        </label>
        {AVATAR_IDS.map((id) => (
          <label key={id} className="avatar-choice">
            <input type="radio" name="avatar" value={id} defaultChecked={current === id} data-autofocus={current === id ? "" : undefined} className="sr-only" />
            {/* 打開視窗才載入 一次二十幾張也只有幾十 KB */}
            <Image src={avatarSrc(id)} alt="" width={48} height={48} unoptimized className="user-avatar-image size-12" />
            <span className="sr-only">{avatarName(id)}</span>
          </label>
        ))}
      </fieldset>
      {/* 成功就關掉視窗 這裡只放錯誤 重送時先收起上一次的 */}
      {!pending && <FormFeedback state={{ error: state.error }} />}
      <FormButtons pending={pending} onCancel={onCancel} />
    </form>
  );
}
