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
};
