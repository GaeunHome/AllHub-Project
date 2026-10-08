"use client";

import { useActionState } from "react";
import { FormFeedback } from "@/core/ui/form-message";
import { Icon } from "@/core/ui/icon";
import { linkAccountAction, type FormState } from "../actions";

export function LinkAccountForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(linkAccountAction, {});

  return (
    <form action={action} className="card flex flex-col gap-4">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-ink">
        <Icon name="key-round" className="size-5 text-accent" />
        連結 HoYoLAB 帳號
      </h2>
      <ol className="steps text-sm leading-relaxed text-ink-soft">
        <li>
          用電腦瀏覽器打開{" "}
          <a href="https://www.hoyolab.com" target="_blank" rel="noreferrer" className="link">
            hoyolab.com
          </a>{" "}
          並登入自己的帳號。
        </li>
        <li>按 F12（Mac：⌥⌘I）打開開發者工具 → Application（應用程式）→ 左側 Cookies → https://www.hoyolab.com。</li>
        <li>
          找到 <code>ltoken_v2</code>、<code>ltuid_v2</code>（有 <code>ltmid_v2</code> 也一起），照
          <code>名稱=值; 名稱=值</code> 的格式貼到下面。整段 cookie 直接貼上也可以，系統只會留下需要的部分。
        </li>
        <li>cookie 等同登入憑證，系統會加密後才存，畫面上不會再顯示。登出 HoYoLAB 或改密碼後 cookie 會失效，到時再重新貼一次。</li>
      </ol>
      <textarea
        name="cookie"
        rows={3}
        required
        placeholder="ltoken_v2=v2_…; ltuid_v2=…; ltmid_v2=…"
        className="input font-mono text-sm"
        autoComplete="off"
        spellCheck={false}
      />
      <FormFeedback state={state} />
      <button disabled={pending} className="btn-primary self-start">
        <Icon name="link" className="size-4" />
        {pending ? "連結中…" : "連結帳號"}
      </button>
    </form>
  );
}
