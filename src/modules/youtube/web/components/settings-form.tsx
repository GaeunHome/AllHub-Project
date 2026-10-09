"use client";

import { useActionState } from "react";
import { FormFeedback } from "@/core/ui/form-message";
import { Icon } from "@/core/ui/icon";
import { saveSettingsAction, type SettingsFormState } from "../actions";
import { AI_PROVIDERS, SUBSCRIPTION_NOTE } from "../ai-providers";
import { GLOSSARY_LIMITS, withCommas } from "../../lib/parse";
import type { SettingsView } from "../../service/translation";

// legend 預設會壓在 fieldset 的邊框上、也不吃父層的 gap；浮動後變成一般的子元素，樣子跟其他卡片的標題列（CardHeader）一樣
const LEGEND_CLASS = "float-left flex w-full flex-wrap items-center gap-3 text-lg font-semibold text-ink";

export function SettingsForm({ settings }: { settings: SettingsView }) {
  const [state, action, pending] = useActionState<SettingsFormState, FormData>(saveSettingsAction, {});

  return (
    <form action={action} className="page-stack">
      <fieldset className="card stack min-w-0">
        <legend className={LEGEND_CLASS}>
          <span className="icon-tile size-9 rounded-xl">
            <Icon name="sparkles" />
          </span>
          翻譯使用的 AI
        </legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {AI_PROVIDERS.map((p) => (
            <label key={p.id} className="choice-card">
              <input type="radio" name="provider" value={p.id} defaultChecked={settings.provider === p.id} className="size-4 shrink-0" />
              {p.name}
            </label>
          ))}
        </div>
        <p className="notice">
          <Icon name="info" />
          <span>{SUBSCRIPTION_NOTE}</span>
        </p>
      </fieldset>

      {AI_PROVIDERS.map((p) => {
        const hint = settings.keys[p.id];
        return (
          <fieldset key={p.id} className="card stack min-w-0">
            <legend className={LEGEND_CLASS}>
              <span className="icon-tile size-9 rounded-xl">
                <Icon name="key-round" />
              </span>
              {p.name}
              {hint !== null && <span className="chip chip-success">已設定</span>}
            </legend>
            {p.note && (
              <details className="disclosure text-sm">
                <summary>關於免費 API Key</summary>
                <p className="leading-relaxed text-ink-soft">{p.note}</p>
              </details>
            )}
            <label className="field">
              <span className="field-label">API Key（{p.keyHint}）</span>
              <input
                type="password"
                name={`key_${p.id}`}
                autoComplete="off"
                placeholder={hint === null ? "未設定" : `已設定（末 4 碼 ${hint}），留空表示不變更`}
                className="input"
              />
            </label>
            {hint !== null && (
              <label className="flex min-h-11 w-fit cursor-pointer items-center gap-3 text-sm text-ink-soft">
                <input type="checkbox" name={`clear_${p.id}`} className="size-4" />
                清除這把金鑰
              </label>
            )}
            <label className="field">
              <span className="field-label">
                模型（留空使用預設 {settings.defaultModels[p.id]}
                {p.id === "anthropic" ? "" : "，這只是建議值，請依你帳號能用的模型填寫"}）
              </span>
              {/* 預設值只放在 placeholder：放進 defaultValue 的話按一次儲存就寫死進資料庫，之後改程式預設值不會生效 */}
              <input name={`model_${p.id}`} defaultValue={settings.customModels[p.id]} placeholder={settings.defaultModels[p.id]} className="input font-mono" />
            </label>
          </fieldset>
        );
      })}

      <label className="card stack">
        <span className="flex items-center gap-3">
          <span className="icon-tile size-9 rounded-xl">
            <Icon name="star" />
          </span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-lg font-semibold text-ink">專有名詞表</span>
            <span className="text-sm text-ink-soft">
              每行一個「韓文=中文」，翻譯時會照這個譯法。最多 {GLOSSARY_LIMITS.entries} 筆、每個詞 {GLOSSARY_LIMITS.termLength} 字以內，合計 {withCommas(GLOSSARY_LIMITS.totalLength)} 字以內。
            </span>
          </span>
        </span>
        <textarea name="glossary" rows={8} defaultValue={state.glossaryText ?? settings.glossaryText} placeholder={"민지=珉池\n뉴진스=NewJeans"} className="input font-mono text-sm" />
      </label>

      <div className="button-row">
        <button disabled={pending} className="btn-primary min-w-32">
          <Icon name="check" className="size-4" />
          {pending ? "儲存中…" : "儲存"}
        </button>
        {!pending && <FormFeedback state={state} />}
      </div>
    </form>
  );
}
