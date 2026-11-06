import type { ModuleInfo } from "@/core/module";

export const starrailInfo: ModuleInfo = {
  id: "starrail",
  name: "星穹鐵道",
  href: "/starrail",
  description: "連結 HoYoLAB 帳號：即時便箋、角色與戰績、開拓月曆，每天自動簽到",
  icon: "/icons/ui/train-front.svg",
  cover: "/images/scenes/module-starrail.svg",
  accent: "gold",
  services: [
    { id: "starrail:note", label: "HoYoLAB 即時便箋" },
    { id: "starrail:checkin", label: "HoYoLAB 簽到" },
    { id: "starrail:warps", label: "HoYoLAB 躍遷紀錄" },
    { id: "starrail:codes", label: "社群的兌換碼清單" },
  ],
  crons: [
    { id: "starrail:checkin", label: "每日簽到" },
    { id: "starrail:stamina", label: "開拓力與每日提醒" },
    { id: "starrail:cleanup", label: "清理簽到紀錄" },
    { id: "starrail:reencrypt", label: "重新加密 cookie" },
    { id: "starrail:redeem", label: "自動兌換" },
  ],
};
