import { Icon } from "@/core/ui/icon";
import { MoreMenu } from "@/core/ui/more-menu";
import { subtitleDownloadPath } from "../../lib/urls";

const DOWNLOADS = [
  { lang: "zh", format: "srt", label: "中文 .srt" },
  { lang: "both", format: "srt", label: "雙語 .srt" },
  { lang: "ko", format: "srt", label: "韓文 .srt" },
  { lang: "zh", format: "vtt", label: "中文 .vtt" },
] as const;

/** 觀看頁頻道列的下載 翻譯共用 登入的人都能下載 */
export function SubtitleDownloadMenu({ videoId }: { videoId: string }) {
  return (
    <MoreMenu
      label="下載字幕"
      triggerClassName="yt-pill"
      trigger={
        <>
          <Icon name="download" className="size-4" />
          下載
        </>
      }
    >
      {DOWNLOADS.map(({ lang, format, label }) => (
        <a key={`${lang}-${format}`} href={subtitleDownloadPath(videoId, lang, format)} className="menu-item">
          <Icon name="download" className="size-4" />
          {label}
        </a>
      ))}
    </MoreMenu>
  );
}
