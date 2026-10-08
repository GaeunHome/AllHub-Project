"use client";

import { useActionState } from "react";
import { FormFeedback } from "@/core/ui/form-message";
import { Icon } from "@/core/ui/icon";
import { saveSettingsAction, type FormState } from "../actions";
import { AI_PROVIDERS, SUBSCRIPTION_NOTE } from "../ai-providers";
import type { SettingsView } from "../../service/translation";

// legend 預設會壓在 fieldset 的邊框上，浮動後才能當成卡片裡的一般標題
const LEGEND_CLASS = "float-left mb-4 flex w-full flex-wrap items-center gap-2 font-semibold text-ink";

export function SettingsForm({ settings }: { settings: SettingsView }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveSettingsAction, {});

  return (
    <form action={action} className="flex flex-col gap-6">
      <fieldset className="card min-w-0">
        <legend className={LEGEND_CLASS}>
          <Icon name="sparkles" className="size-5 text-accent" />
          翻譯使用的 AI
        </legend>
        <div className="clear-both grid grid-cols-1 gap-3 sm:grid-cols-3">
          {AI_PROVIDERS.map((p) => (
            <label key={p.id} className="choice-card">
              <input type="radio" name="provider" value={p.id} defaultChecked={settings.provider === p.id} className="size-4 shrink-0" />
              {p.name}
            </label>
          ))}
        </div>
        <p className="notice mt-4">
          <Icon name="info" />
          <span>{SUBSCRIPTION_NOTE}</span>
        </p>
      </fieldset>

      {AI_PROVIDERS.map((p) => {
        const hint = settings.keys[p.id];
        return (
          <fieldset key={p.id} className="card min-w-0">
            <legend className={LEGEND_CLASS}>
              <Icon name="key-round" className="size-5 text-accent" />
              {p.name}
              {hint !== null && <span className="chip chip-success">已設定</span>}
            </legend>
            <div className="clear-both flex flex-col gap-4">
              {p.note && <p className="text-sm leading-relaxed text-muted">{p.note}</p>}
              <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-soft">
                API Key（{p.keyHint}）
                <input
                  type="password"
                  name={`key_${p.id}`}
                  autoComplete="off"
                  placeholder={hint === null ? "未設定" : `已設定（末 4 碼 ${hint}），留空表示不變更`}
                  className="input font-normal"
                />
              </label>
              {hint !== null && (
                <label className="flex w-fit cursor-pointer items-center gap-2 text-sm text-ink-soft">
                  <input type="checkbox" name={`clear_${p.id}`} className="size-4" />
                  清除這把金鑰
                </label>
              )}
              <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-soft">
                模型（留空使用預設 {settings.defaultModels[p.id]}
                {p.id === "anthropic" ? "" : "，這只是建議值，請依你帳號能用的模型填寫"}）
                {/* 預設值只放在 placeholder：放進 defaultValue 的話按一次儲存就寫死進資料庫，之後改程式預設值不會生效 */}
                <input
                  name={`model_${p.id}`}
                  defaultValue={settings.customModels[p.id]}
                  placeholder={settings.defaultModels[p.id]}
                  className="input font-mono font-normal"
                />
              </label>
            </div>
          </fieldset>
        );
      })}

      <label className="card flex flex-col gap-2">
        <span className="flex items-center gap-2 font-semibold text-ink">
          <Icon name="star" className="size-5 text-accent" />
          專有名詞表
        </span>
        <span className="text-sm text-muted">每行一個「韓文=中文」，例如成員名、團名、節目名。翻譯時會照這個譯法。</span>
        <textarea name="glossary" rows={8} defaultValue={settings.glossaryText} placeholder={"민지=珉池\n뉴진스=NewJeans"} className="input mt-1 font-mono text-sm" />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button disabled={pending} className="btn-primary min-w-32">
          <Icon name="check" className="size-4" />
          {pending ? "儲存中…" : "儲存"}
        </button>
        {!pending && <FormFeedback state={state} />}
      </div>
    </form>
  );
}
