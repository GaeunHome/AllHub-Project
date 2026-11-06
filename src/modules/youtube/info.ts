import type { ModuleInfo } from "@/core/module";

export const youtubeInfo: ModuleInfo = {
  id: "youtube",
  name: "YouTube",
  href: "/youtube",
  description: "追蹤頻道的新影片，需要時用 AI 把韓文字幕翻成中文",
  icon: "/icons/brands/youtube.svg",
  cover: "/images/scenes/module-youtube.svg",
  accent: "red",
  services: [{ id: "youtube:websub", label: "YouTube 新影片訂閱" }],
  crons: [
    { id: "youtube:renew", label: "續訂新影片通知" },
    { id: "youtube:cleanup", label: "清理影片" },
    { id: "youtube:reencrypt", label: "重新加密 API Key" },
  ],
};
