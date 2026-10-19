"use client";

import { createContext, useContext, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Dialog, DialogMessage, useDialog, useDialogForm } from "@/core/ui/dialog";
import { FormFeedback } from "@/core/ui/form-message";
import { Icon } from "@/core/ui/icon";
import { COUNTIES } from "../../lib/counties";
import type { WeatherSettings } from "../../service/settings";
import { saveSettingsAction } from "../actions";

type Report = (message: string | undefined, focus?: boolean) => void;

const ReportContext = createContext<Report>(() => {});

/**
 * 卡片內容的外框 空狀態被換掉時存好的訊息還在
 * 打開視窗的按鈕跟著不見時才把焦點移到訊息 不掉到 body
 */
export function SettingsResult({ children }: { children: ReactNode }) {
  const [result, setResult] = useState<{ message?: string; focus?: boolean }>({});
  const ref = useRef<HTMLParagraphElement>(null);
  useLayoutEffect(() => {
    if (result.message && result.focus) ref.current?.focus();
  }, [result]);
  // Activity 藏起首頁時清掉 回來時才不會留著上次的訊息
  useLayoutEffect(() => () => setResult({}), []);

  return (
    <ReportContext value={(message, focus) => setResult({ message, focus })}>
      <div className="stack">
        {children}
        {/* 靠右 跟卡片底下的設定按鈕對齊 */}
        <DialogMessage message={result.message} ref={ref} className="flex justify-end" />
      </div>
    </ReportContext>
  );
}

/** 還沒選縣市時是主要按鈕 選過之後是卡片底下的小按鈕 打開的是同一個視窗 */
export function CountyPicker({ settings }: { settings: WeatherSettings | null }) {
  const dialog = useDialog();
  const report = useContext(ReportContext);
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

/** 縣市與早上的下雨通知一起存 沒選過時通知預設開 */
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
      {/* 整行都點得到 觸控裝置也有 44px 高 */}
      <label className="flex min-h-11 cursor-pointer items-center gap-2.5 self-start text-ink">
        <input type="checkbox" name="rainAlert" value="true" defaultChecked={settings?.rainAlert ?? true} className="size-4.5 shrink-0" />
        早上會下雨時通知我
      </label>
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
