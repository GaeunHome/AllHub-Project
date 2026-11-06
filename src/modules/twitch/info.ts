import type { ModuleInfo } from "@/core/module";

export const twitchInfo: ModuleInfo = {
  id: "twitch",
  name: "Twitch",
  href: "/twitch",
  description: "追蹤主播，開台時通知你，順便看誰正在直播",
  icon: "/icons/brands/twitch.svg",
  cover: "/images/scenes/module-twitch.svg",
  accent: "violet",
  services: [{ id: "twitch:eventsub", label: "Twitch 開台訂閱" }],
  crons: [
    { id: "twitch:sync", label: "同步開台訂閱" },
    { id: "twitch:cleanup", label: "清理開台紀錄" },
  ],
};
