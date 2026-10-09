"use client";

import { useActionState, useState } from "react";
import { FormFeedback } from "@/core/ui/form-message";
import { Icon } from "@/core/ui/icon";
import { linkAccountAction, type LinkState } from "../actions";
import type { RoleChoice } from "../../service/accounts";

/** 還沒連結帳號時展開；已經有帳號時收起來，要更新 cookie 再打開。cookie 只放在這個表單的狀態裡：選伺服器的第二步再送一次，伺服器不存 */
export function LinkAccountForm({ defaultOpen }: { defaultOpen: boolean }) {
  const [cookie, setCookie] = useState("");
  const [choices, setChoices] = useState<RoleChoice[] | null>(null);
  const [state, action, pending] = useActionState<LinkState, FormData>(async (previous, formData) => {
    const result = await linkAccountAction(previous, formData);
    if (result.roles) setChoices(result.roles);
    else if (result.message) {
      // 連結好了就不必再留著 cookie
      setChoices(null);
      setCookie("");
    }
    // 出錯時留在原本的步驟，訊息顯示在表單上
    return result;
  }, {});

  return (
    <details open={defaultOpen} className="sr-panel group p-5 sm:p-6">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 font-semibold text-ink [&::-webkit-details-marker]:hidden">
        <Icon name="key-round" className="size-5 text-sr-gold" />
        {defaultOpen ? "連結 HoYoLAB 帳號" : "新增帳號或更新 cookie"}
        <Icon name="chevron-right" className="ml-auto size-4 text-ink-soft transition-transform group-open:rotate-90" />
      </summary>
      {/* details 不吃父層的 gap，展開的表單用 margin 跟 summary 隔開 */}
      <form action={action} className="stack mt-4">
        {choices ? (
          <RoleChooser cookie={cookie} choices={choices} pending={pending} onBack={() => setChoices(null)} />
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
              placeholder="ltoken_v2=v2_…; ltuid_v2=…; ltmid_v2=…; cookie_token_v2=…; account_id_v2=…"
              className="input font-mono text-sm"
              autoComplete="off"
              spellCheck={false}
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
        {!pending && !state.roles && <FormFeedback state={state} />}
      </form>
    </details>
  );
}

function CookieHelp() {
  return (
    <details className="disclosure text-sm">
      <summary>怎麼取得 cookie？</summary>
      <ol className="steps leading-relaxed text-ink-soft">
        <li>
          用電腦瀏覽器打開{" "}
          <a href="https://www.hoyolab.com" target="_blank" rel="noreferrer" className="link">
            hoyolab.com
          </a>{" "}
          並登入自己的帳號。
        </li>
        <li>按 F12（Mac：⌥⌘I）打開開發者工具 → Application（應用程式）→ 左側 Cookies → https://www.hoyolab.com。</li>
        <li>
          複製 <code>ltoken_v2</code>、<code>ltuid_v2</code>（有 <code>ltmid_v2</code> 也一起），照 <code>名稱=值; 名稱=值</code> 的格式貼到下面；整段貼上也可以，系統只留下需要的部分。
        </li>
        <li>
          要用兌換碼的話，一併複製 <code>cookie_token_v2</code>、<code>account_id_v2</code>、<code>account_mid_v2</code>。
        </li>
        <li>cookie 等同登入憑證，會加密後才存。登出 HoYoLAB 或改密碼後會失效，到時再貼一次。</li>
      </ol>
    </details>
  );
}

type RoleChooserProps = { cookie: string; choices: RoleChoice[]; pending: boolean; onBack: () => void };

/** 同一個 HoYoLAB 帳號在好幾個伺服器都有角色時，讓使用者勾選要連結哪些；預設勾等級最高的 */
function RoleChooser({ cookie, choices, pending, onBack }: RoleChooserProps) {
  return (
    <fieldset className="stack min-w-0">
      {/* legend 浮動後才會是一般的子元素，吃得到父層的 gap */}
      <legend className="float-left font-semibold text-ink">這個 HoYoLAB 帳號在好幾個伺服器都有角色，要連結哪些？</legend>
      <input type="hidden" name="cookie" value={cookie} />
      <input type="hidden" name="step" value="choose" />
      <div className="flex flex-col gap-2">
        {choices.map((role) => (
          <label key={role.uid} className="choice-card flex-wrap">
            <input type="checkbox" name="uid" value={role.uid} defaultChecked={role.selected} className="size-4 shrink-0" />
            <span className="chip border-[var(--sr-gold-line)] bg-[var(--sr-gold-soft)] text-[#f4d79b]">{role.server}</span>
            <span className="font-semibold text-ink">{role.nickname ?? "（未知暱稱）"}</span>
            {role.level !== null && <span className="sr-num text-lg font-bold text-sr-gold">Lv.{role.level}</span>}
            <span className="text-sm text-ink-soft">
              UID <span className="sr-num text-base">{role.uid}</span>
            </span>
            {role.likelyUnused && <span className="chip chip-warning">可能是沒在玩的帳號</span>}
          </label>
        ))}
      </div>
      <div className="button-row">
        <button disabled={pending} className="btn-primary">
          <Icon name={pending ? "loader-circle" : "link"} className={pending ? "size-4 motion-safe:animate-spin" : "size-4"} />
          {pending ? "連結中…" : "連結勾選的帳號"}
        </button>
        <button type="button" onClick={onBack} disabled={pending} className="btn-secondary">
          重新貼 cookie
        </button>
      </div>
    </fieldset>
  );
}
