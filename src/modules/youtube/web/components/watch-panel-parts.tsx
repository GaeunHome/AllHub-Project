import Link from "next/link";
import type { ReactNode } from "react";
import { FormMessage } from "@/core/ui/form-message";
import { Icon } from "@/core/ui/icon";
import type { Progress } from "../../service/translation";

// 觀看頁翻譯面板與開始面板共用的小元件

export const CONNECTION_ERROR = "連線失敗，請稍後再試";

export const isActive = (status: Progress["status"] | undefined) => status === "queued" || status === "running";

/** 翻譯面板回報給播放器的譯文與翻譯中狀態 */
export type LiveUpdate = { translated?: (string | null)[]; translating: boolean };

/** 左邊頭像與名稱 右邊一排膠囊按鈕 手機上按鈕橫向捲動 跟 YouTube App 一樣 */
export function ChannelRow({ channel, children }: { channel: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
      <div className="min-w-0 flex-1 basis-48">{channel}</div>
      <div className="no-scrollbar -mx-4 flex w-[calc(100%+2rem)] items-center gap-2 overflow-x-auto px-4 sm:mx-0 sm:w-auto sm:flex-wrap sm:overflow-visible sm:px-0">
        {children}
      </div>
    </div>
  );
}

function SettingsLink({ href }: { href: string }) {
  return (
    <Link href={href} className="btn-secondary btn-sm">
      <Icon name="settings" className="size-3.5" />
      前往翻譯設定
    </Link>
  );
}

export function ErrorMessage({ message, needsSettings, settingsHref }: { message: string; needsSettings: boolean; settingsHref: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <FormMessage tone="error">{message}</FormMessage>
      {needsSettings && <SettingsLink href={settingsHref} />}
    </div>
  );
}

/** 沒有 API Key 時的提示 旁邊附上翻譯設定的連結 */
export function ApiKeyNotice({ settingsHref, children }: { settingsHref: string; children: ReactNode }) {
  return (
    <div className="notice flex-wrap items-center">
      <Icon name="key-round" />
      <span className="min-w-48 flex-1">{children}</span>
      <SettingsLink href={settingsHref} />
    </div>
  );
}
