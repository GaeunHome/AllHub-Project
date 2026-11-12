"use client";

import { useEffect, useId, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useDialogForm } from "@/core/ui/dialog";
import { FormFeedback } from "@/core/ui/form-message";
import { Icon } from "@/core/ui/icon";
import { PasswordInput } from "@/core/ui/password-input";
import { loginAccountAction, type GeetestChallenge, type LoginState } from "../actions";
import type { RoleChoice } from "../../service/link";
import { PassTrack } from "./boarding-pass";
import { GeetestCaptcha } from "./geetest-captcha";

const DEVICE_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/** 每次登入的裝置 id 同一次登入的每一步都要一樣 HoYoverse 才不會當成別的裝置 */
function newDeviceId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => DEVICE_ALPHABET[byte % DEVICE_ALPHABET.length]).join("");
}

const isLinked = (result: LoginState) => !result.error && !result.roles && !result.captcha && !result.verify;

type Props = {
  /** 好幾個伺服器都有角色時 交給貼上 cookie 那一份的選伺服器 */
  onRoles: (roles: RoleChoice[], cookie: string) => void;
  onDone: (message: string | undefined, result: LoginState) => void;
};

/**
 * 帳號密碼只放在表單狀態裡 每一步都再送一次 伺服器不存
 * 圖形驗證解完自動送出 email 驗證碼要使用者填
 */
export function LoginLinkForm({ onRoles, onDone }: Props) {
  const id = useId();
  const deviceId = useRef<string | null>(null);
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [challenge, setChallenge] = useState<GeetestChallenge | null>(null);
  const [aigis, setAigis] = useState("");
  const [verify, setVerify] = useState<string | null>(null);

  const restart = () => {
    setChallenge(null);
    setAigis("");
    setVerify(null);
  };
  const step = async (previous: LoginState, formData: FormData) => {
    deviceId.current ??= newDeviceId();
    formData.set("deviceId", deviceId.current);
    const result = await loginAccountAction(previous, formData);
    // 解過的圖形驗證只能用一次
    setAigis("");
    setChallenge(result.captcha ?? null);
    if (result.verify) setVerify(result.verify);
    if (result.roles && result.cookie) onRoles(result.roles, result.cookie);
    return result;
  };
  const { state, pending, formProps } = useDialogForm(step, onDone, isLinked);

  // 換到下一步時焦點放到那一步的第一個欄位 出錯時由 useDialogForm 放回
  useEffect(() => {
    if (state.captcha || state.verify) formProps.ref.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
  }, [state, formProps.ref]);

  const passCaptcha = (payload: string) => {
    flushSync(() => setAigis(payload));
    formProps.ref.current?.requestSubmit();
  };

  const credentials = (
    <>
      <input type="hidden" name="account" value={account} />
      <input type="hidden" name="password" value={password} />
    </>
  );
  const restartButton = (
    <button type="button" onClick={restart} disabled={pending} className="btn-secondary">
      重新登入
    </button>
  );

  return (
    <form {...formProps} className="stack">
      <PassTrack current={challenge || verify ? 2 : 1} />
      {challenge ? (
        <>
          {credentials}
          <input type="hidden" name="aigis" value={aigis} />
          <p tabIndex={-1} data-autofocus className="text-ink outline-none">
            HoYoverse 要求圖形驗證，完成後會自動繼續登入。
          </p>
          {pending ? <Pending label="登入中…" /> : <GeetestCaptcha challenge={challenge} onPass={passCaptcha} />}
          <div className="button-row">{restartButton}</div>
        </>
      ) : verify ? (
        <>
          {credentials}
          <input type="hidden" name="verify" value={verify} />
          <label className="field">
            <span className="field-label">HoYoverse 寄到 email 的驗證碼</span>
            <input name="code" required inputMode="numeric" autoComplete="one-time-code" maxLength={8} className="input sr-num text-lg" data-autofocus />
          </label>
          <div className="button-row">
            <button disabled={pending} className="btn-primary">
              <PendingIcon pending={pending} icon="shield-check" />
              {pending ? "驗證中…" : "驗證並連結"}
            </button>
            {restartButton}
          </div>
        </>
      ) : (
        <>
          <label className="field">
            <span className="field-label">HoYoverse 帳號（email）</span>
            <input
              name="account"
              required
              value={account}
              onChange={(event) => setAccount(event.target.value)}
              maxLength={200}
              autoComplete="off"
              spellCheck={false}
              className="input"
              data-autofocus
            />
          </label>
          <div className="field">
            <label htmlFor={`${id}-password`} className="field-label">
              密碼
            </label>
            <PasswordInput id={`${id}-password`} name="password" required value={password} onChange={(event) => setPassword(event.target.value)} maxLength={200} autoComplete="off" />
          </div>
          <p className="notice">
            <Icon name="lock" />
            密碼只用來向 HoYoverse 登入這一次，不會存下來；之後登入過期時，網站會自動換新，不用再貼 cookie。
          </p>
          <button disabled={pending} className="btn-primary self-start">
            <PendingIcon pending={pending} icon="link" />
            {pending ? "登入中…" : "登入並連結"}
          </button>
        </>
      )}
      {!pending && !state.roles && <FormFeedback state={{ error: state.error }} />}
    </form>
  );
}

function PendingIcon({ pending, icon }: { pending: boolean; icon: "link" | "shield-check" }) {
  return <Icon name={pending ? "loader-circle" : icon} className={pending ? "size-4 motion-safe:animate-spin" : "size-4"} />;
}

function Pending({ label }: { label: string }) {
  return (
    <p className="flex min-h-11 items-center gap-2 text-ink">
      <PendingIcon pending icon="link" />
      {label}
    </p>
  );
}
