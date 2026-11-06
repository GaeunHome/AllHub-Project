"use client";

import { useId } from "react";
import { DialogButton, useDialogForm } from "../ui/dialog";
import { FormButtons } from "../ui/form-buttons";
import { FormFeedback } from "../ui/form-message";
import { Icon } from "../ui/icon";
import { InfoTip } from "../ui/info-tip";
import { updateNicknameAction } from "./actions";

/** 跟登出排在一起 存好後關掉視窗 結果用提示視窗 */
export function NicknameButton({ nickname }: { nickname: string | null }) {
  return (
    <DialogButton
      label={
        <>
          <Icon name="pencil" className="size-4" />
          修改暱稱
        </>
      }
      title="修改暱稱"
      size="sm"
    >
      {({ done, close }) => <NicknameForm nickname={nickname} onDone={done} onCancel={close} />}
    </DialogButton>
  );
}

type NicknameFormProps = {
  nickname: string | null;
  onDone: (message: string | undefined) => void;
  onCancel: () => void;
};

/** 不設 maxLength 它算 UTF-16 單位 emoji 打不到規則的字數 字數以伺服器的驗證為準 */
function NicknameForm({ nickname, onDone, onCancel }: NicknameFormProps) {
  const { state, pending, formProps } = useDialogForm(updateNicknameAction, onDone);
  const inputId = useId();

  return (
    <form {...formProps} className="stack">
      <div className="field">
        <span className="flex items-center gap-1">
          <label htmlFor={inputId} className="field-label">
            暱稱
          </label>
          <InfoTip label="暱稱的說明">顯示在人像選單與首頁，登入還是用帳號名稱</InfoTip>
        </span>
        <input id={inputId} name="nickname" defaultValue={nickname ?? ""} autoComplete="off" data-autofocus className="input" />
      </div>
      {/* 成功就關掉視窗 這裡只放錯誤 重送時先收起上一次的 */}
      {!pending && <FormFeedback state={{ error: state.error }} />}
      <FormButtons pending={pending} onCancel={onCancel} />
    </form>
  );
}
