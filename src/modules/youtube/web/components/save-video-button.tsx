"use client";

import { createContext, use } from "react";
import { ActionButton } from "@/core/ui/action-button";
import type { FormState } from "@/core/ui/form-message";
import { Icon } from "@/core/ui/icon";
import { removeSavedVideoAction, saveVideoAction } from "../actions";

/**
 * 這一頁剛自動加入的影片 續翻不重繪頁面 伺服器算繪的還是保留
 * clear 在使用者自己移除後放掉
 */
export type AutoSaved = { videoId: string | null; clear: () => void };

export const AutoSavedContext = createContext<AutoSaved>({ videoId: null, clear: () => {} });

type SaveVideoButtonProps = {
  videoId: string;
  saved: boolean;
  /**
   * 只在已保留是這一頁自己記下的時候才有
   * 移除成功後呼叫 重繪後才不會又變回已保留
   */
  onRemoved?: () => void;
};

/** 自動加入的也算已保留 再按一次移除 按錯了可以再保留回來 所以不另外確認 */
export function SaveVideoButton({ videoId, saved, onRemoved }: SaveVideoButtonProps) {
  const remove = onRemoved
    ? async (previous: FormState, formData: FormData) => {
        const result = await removeSavedVideoAction(previous, formData);
        if (!result.error) onRemoved();
        return result;
      }
    : removeSavedVideoAction;
  return (
    <ActionButton
      action={saved ? remove : saveVideoAction}
      fields={{ videoId }}
      // 按鈕在頻道名稱後面靠左 錯誤訊息也靠左排在下面 出現時按鈕不會被推到右邊
      formClassName="flex shrink-0 flex-col items-start gap-1 [&_[role=alert]]:text-left"
      className="yt-pill"
      title={saved ? "從已保留的影片移除" : "加進已保留的影片，之後在 YouTube 頁的「已保留」找得到"}
      {...(saved ? { "aria-label": "已保留（按一下移除）" } : {})}
      pendingLabel={
        <>
          <Icon name="loader-circle" className="size-4 motion-safe:animate-spin" />
          {saved ? "移除中…" : "保留中…"}
        </>
      }
    >
      <Icon name={saved ? "bookmark-check" : "bookmark"} className="size-4" />
      {saved ? "已保留" : "保留"}
    </ActionButton>
  );
}

/** 頻道列用的版本 伺服器算繪的狀態加上這一頁續翻後剛自動加入的 */
export function WatchSaveButton({ videoId, saved }: { videoId: string; saved: boolean }) {
  const autoSaved = use(AutoSavedContext);
  const justSaved = autoSaved.videoId === videoId;
  return <SaveVideoButton videoId={videoId} saved={saved || justSaved} onRemoved={justSaved ? autoSaved.clear : undefined} />;
}
