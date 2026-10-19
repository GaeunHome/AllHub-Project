import { ActionButton } from "@/core/ui/action-button";
import { Icon } from "@/core/ui/icon";
import { recheckCaptionsAction } from "../actions";

/** 影片選單裡的按鈕 很多頻道上片後才補字幕 背景會自動檢查 這裡讓人馬上再查一次 */
export function RecheckCaptionsButton({ videoId }: { videoId: string }) {
  return (
    <ActionButton
      action={recheckCaptionsAction}
      fields={{ videoId }}
      formClassName="flex flex-col gap-1"
      className="menu-item"
      showMessage="inline"
      feedbackClassName="px-3 pb-1"
      pendingLabel={
        <>
          <Icon name="refresh-cw" className="size-4 motion-safe:animate-spin" />
          檢查中…
        </>
      }
    >
      <Icon name="refresh-cw" className="size-4" />
      重新檢查中文字幕
    </ActionButton>
  );
}
