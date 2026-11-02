"use client";

import type { ReactNode } from "react";
import { Dialog, useDialog, useDialogForm } from "@/core/ui/dialog";
import { FormFeedback } from "@/core/ui/form-message";
import { Icon } from "@/core/ui/icon";
import { ResultSlot, useResultReport } from "@/core/ui/result-slot";
import { COUNTIES } from "../../lib/counties";
import type { WeatherSettings } from "../../service/settings";
import { saveSettingsAction } from "../actions";

/** 卡片內容的外框 空狀態被換掉時存好的訊息還在 內容與訊息靠 stack 排間距 */
export function SettingsResult({ children }: { children: ReactNode }) {
  return (
    <div className="stack">
      <ResultSlot>{children}</ResultSlot>
    </div>
  );
}

/** 還沒選縣市時是主要按鈕 選過之後是卡片底下的小按鈕 打開的是同一個視窗 */
export function CountyPicker({ settings }: { settings: WeatherSettings | null }) {
  const dialog = useDialog();
  const report = useResultReport();
  const done = (message: string | undefined) => {
    dialog.done();
    // 第一次選縣市時這個按鈕會跟著空狀態不見 焦點才移到訊息
    report(message, settings === null);
  };

  return (
    <>
      <button
        {...dialog.triggerProps}
        onClick={() => {
          report(undefined);
          dialog.triggerProps.onClick();
        }}
        // 只看得到設定兩個字 報讀器要知道是哪一張卡片的設定
        aria-label={settings ? "天氣設定" : undefined}
        // 小按鈕用負邊距抵掉內距 字跟卡片內容的右邊線對齊
        className={settings ? "btn-ghost btn-sm -mr-3" : "btn-primary"}
      >
        {settings ? (
          <>
            <Icon name="settings" className="size-4" />
            設定
          </>
        ) : (
          "選擇縣市"
        )}
      </button>
      <Dialog {...dialog.dialogProps} title="天氣設定" size="sm">
        {dialog.open && <SettingsForm settings={settings} onDone={done} onCancel={dialog.close} />}
      </Dialog>
    </>
  );
}

/** 整行都點得到 觸控裝置也有 44px 高 */
function AlertCheckbox({ name, defaultChecked, children }: { name: "rainAlert" | "warningAlert"; defaultChecked: boolean; children: ReactNode }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-2.5 self-start text-ink">
      <input type="checkbox" name={name} value="true" defaultChecked={defaultChecked} className="size-4.5 shrink-0" />
      {children}
    </label>
  );
}

/** 縣市與兩種通知一起存 沒選過時通知預設開 */
export function SettingsForm({ settings, onDone, onCancel }: { settings: WeatherSettings | null; onDone: (message: string | undefined) => void; onCancel: () => void }) {
  const { state, pending, formProps } = useDialogForm(saveSettingsAction, onDone);
  return (
    <form {...formProps} className="stack">
      <label className="field">
        <span className="field-label">縣市</span>
        <select name="county" defaultValue={settings?.county ?? "臺北市"} className="input" data-autofocus>
          {COUNTIES.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-col">
        <AlertCheckbox name="rainAlert" defaultChecked={settings?.rainAlert ?? true}>
          早上會下雨時通知我
        </AlertCheckbox>
        <AlertCheckbox name="warningAlert" defaultChecked={settings?.warningAlert ?? true}>
          天氣警特報通知
        </AlertCheckbox>
      </div>
      {/* 成功就關掉視窗 這裡只放錯誤 重送時先收起上一次的 */}
      {!pending && <FormFeedback state={{ error: state.error }} />}
      <div className="button-row justify-end">
        <button type="button" className="btn-ghost" onClick={onCancel} disabled={pending}>
          取消
        </button>
        <button type="submit" className="btn-primary" disabled={pending}>
          <Icon name="check" className="size-4" />
          {pending ? "儲存中…" : "儲存"}
        </button>
      </div>
    </form>
  );
}
