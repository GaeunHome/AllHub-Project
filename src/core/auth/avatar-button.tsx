"use client";

import Image from "next/image";
import { AVATAR_IDS, avatarName, avatarOf, avatarSrc } from "../avatars";
import { DialogButton, useDialogForm } from "../ui/dialog";
import { FormButtons } from "../ui/form-buttons";
import { FormFeedback } from "../ui/form-message";
import { Icon } from "../ui/icon";
import { UserAvatar } from "../ui/user-avatar";
import { updateAvatarAction } from "./actions";

type AvatarProps = { username: string; name: string; avatar: string | null };

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
      {({ done, close }) => <AvatarForm {...props} onDone={done} onCancel={close} />}
    </DialogButton>
  );
}

type AvatarFormProps = AvatarProps & { onDone: (message: string | undefined) => void; onCancel: () => void };

function AvatarForm({ username, name, avatar, onDone, onCancel }: AvatarFormProps) {
  const { state, pending, formProps } = useDialogForm(updateAvatarAction, onDone);
  const current = avatarOf(avatar);

  return (
    <form {...formProps} className="stack">
      <fieldset className="grid grid-cols-4 gap-3 sm:grid-cols-6">
        <legend className="sr-only">選一個頭像</legend>
        <label className="avatar-choice">
          <input type="radio" name="avatar" value="" defaultChecked={current === null} data-autofocus={current === null ? "" : undefined} className="sr-only" />
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
