import type { ModuleInfo } from "@/core/module";

export const remindersInfo: ModuleInfo = {
  id: "reminders",
  name: "提醒與倒數",
  href: "/",
  description: "記下重要的日子，首頁倒數、到了通知你，日期過了自動刪除",
  icon: "/icons/ui/calendar-clock.svg",
  accent: "violet",
  homeOnly: true,
};
