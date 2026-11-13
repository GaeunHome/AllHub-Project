"use client";

import { useEffect, useState } from "react";
import { useDialogForm } from "@/core/ui/dialog";
import { FormFeedback } from "@/core/ui/form-message";
import { Icon } from "@/core/ui/icon";
import { linkAccountAction, type LinkState } from "../actions";
import type { RoleChoice } from "../../service/link";
import { PassTrack } from "./boarding-pass";
import { GoldChip } from "./sr-visuals";

// 貼上 cookie 連結 與帳號密碼登入後的選伺服器

/** 帳號密碼登入後好幾個伺服器都有角色 cookie 交給這一份選伺服器 */
export type Handoff = { cookie: string; roles: RoleChoice[] };

/** 還要選伺服器或出錯時留在表單裡 */
const isLinked = (result: LinkState) => !result.error && !result.roles;

type CookieLinkFormProps = {
  onDone: (message: string | undefined, result: LinkState) => void;
  /** 帳號密碼登入後直接從選伺服器開始 返回時回到登入 */
  handoff?: Handoff;
  onBack?: () => void;
};

/**
 * cookie 只放在表單狀態裡 選伺服器的第二步再送一次 伺服器不存
 * 連結好了導向剛連結的帳號 結果用提示視窗
 */
export function CookieLinkForm({ onDone, handoff, onBack }: CookieLinkFormProps) {
  const [cookie, setCookie] = useState(handoff?.cookie ?? "");
  const [choices, setChoices] = useState<RoleChoice[] | null>(handoff?.roles ?? null);
  const step = async (previous: LinkState, formData: FormData) => {
    const result = await linkAccountAction(previous, formData);
    if (result.roles) setChoices(result.roles);
    return result;
  };
  const { state, pending, formProps } = useDialogForm(
    step,
    (message, result) => {
      // 連結好了就不用再留著 cookie
      setChoices(null);
      setCookie("");
      onDone(message, result);
    },
    isLinked,
  );

  // 送出時按鈕停用 焦點會掉到 body 換到選伺服器時放到第一個角色
  // 出錯時由 useDialogForm 放回這一步的欄位
  useEffect(() => {
    if (state.roles) formProps.ref.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
  }, [state, formProps.ref]);

  return (
    <form {...formProps} className="stack">
      {handoff && <PassTrack current={3} />}
      {choices ? (
        <RoleChooser
          cookie={cookie}
          choices={choices}
          pending={pending}
          backLabel={handoff ? "重新登入" : undefined}
          onBack={handoff && onBack ? onBack : () => setChoices(null)}
        />
      ) : (
        <>
          <CookieHelp />
          <textarea
            name="cookie"
            rows={3}
            required
            value={cookie}
            onChange={(event) => setCookie(event.target.value)}
            aria-label="HoYoLAB cookie"
            placeholder="ltoken_v2=v2_…; ltuid_v2=…; ltmid_v2=…; cookie_token_v2=v2_…; account_id_v2=…; account_mid_v2=…"
            className="input font-mono text-sm"
            autoComplete="off"
            spellCheck={false}
            data-autofocus
          />
          <p className="notice">
            <Icon name="info" />
            資料來自 HoYoLAB 的非官方介面，改版時可能暫時失效；只用在自己的帳號上。
          </p>
          <button disabled={pending} className="btn-primary self-start">
            <Icon name={pending ? "loader-circle" : "link"} className={pending ? "size-4 motion-safe:animate-spin" : "size-4"} />
            {pending ? "查詢角色中…" : "連結帳號"}
          </button>
        </>
      )}
      {!pending && !state.roles && <FormFeedback state={{ error: state.error }} />}
    </form>
  );
}

function CookieHelp() {
  return (
    <details className="disclosure text-sm">
      <summary>怎麼取得 cookie？</summary>
      <ol className="steps leading-relaxed text-ink">
        <li>
          用電腦瀏覽器打開{" "}
          <a href="https://www.hoyolab.com" target="_blank" rel="noreferrer" className="link">
            hoyolab.com
          </a>{" "}
          並登入自己的帳號。
        </li>
        <li>按 F12（Mac：⌥⌘I）打開開發者工具 → Application（應用程式）→ 左側 Cookies → https://www.hoyolab.com。</li>
        <li>
          複製這六個：<code>ltoken_v2</code>、<code>ltuid_v2</code>、<code>ltmid_v2</code>、<code>cookie_token_v2</code>、<code>account_id_v2</code>、
          <code>account_mid_v2</code>，照 <code>名稱=值; 名稱=值</code> 的格式貼到下面；整段貼上也可以，系統只留下需要的部分。
        </li>
        <li>值要整段複製：在值上點兩下選取時，遇到「-」就會停住，只選到一部分。</li>
        <li>開拓月曆、兌換碼與躍遷紀錄要用 <code>cookie_token_v2</code> 和 <code>account_</code> 開頭的兩個；找不到 <code>cookie_token_v2</code> 時，登出 HoYoLAB 再重新登入，然後重新複製。</li>
        <li>cookie 等同登入憑證，會加密後才存。登出 HoYoLAB 或改密碼後會失效，到時再貼一次；想自動換新就改用帳號密碼登入。</li>
      </ol>
    </details>
  );
}

type RoleChooserProps = { cookie: string; choices: RoleChoice[]; pending: boolean; onBack: () => void; backLabel?: string };

/** 好幾個伺服器都有角色時讓使用者勾選要連結哪些 預設勾等級最高的 */
export function RoleChooser({ cookie, choices, pending, onBack, backLabel = "重新貼 cookie" }: RoleChooserProps) {
  return (
    <fieldset className="stack min-w-0">
      {/* legend 浮動後才是一般的子元素 吃得到父層的 gap */}
      <legend className="float-left font-semibold text-ink">這個 HoYoLAB 帳號在好幾個伺服器都有角色，要連結哪些？</legend>
      <input type="hidden" name="cookie" value={cookie} />
      <input type="hidden" name="step" value="choose" />
      <div className="flex flex-col gap-2">
        {choices.map((role, index) => (
          <label key={role.uid} className="choice-card flex-wrap">
            <input type="checkbox" name="uid" value={role.uid} defaultChecked={role.selected} data-autofocus={index === 0 || undefined} className="size-4 shrink-0" />
            <GoldChip>{role.server}</GoldChip>
            <span className="font-semibold text-ink">{role.nickname ?? "（未知暱稱）"}</span>
            {role.level !== null && <span className="sr-num text-lg font-bold text-sr-gold">Lv.{role.level}</span>}
            <span className="text-sm text-ink-soft">
              UID <span className="sr-num text-base">{role.uid}</span>
            </span>
          </label>
        ))}
      </div>
      <div className="button-row">
        <button disabled={pending} className="btn-primary">
          <Icon name={pending ? "loader-circle" : "link"} className={pending ? "size-4 motion-safe:animate-spin" : "size-4"} />
          {pending ? "連結中…" : "連結勾選的帳號"}
        </button>
        <button type="button" onClick={onBack} disabled={pending} className="btn-secondary">
          {backLabel}
        </button>
      </div>
    </fieldset>
  );
}
