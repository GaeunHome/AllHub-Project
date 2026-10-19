import type { ModuleInfo } from "@/core/module";

export const weatherInfo: ModuleInfo = {
  id: "weather",
  name: "天氣",
  href: "/",
  description: "首頁顯示所在縣市的天氣、降雨機率與空氣品質，會下雨時提醒帶傘",
  icon: "/icons/ui/cloud-sun.svg",
  accent: "blue",
  homeOnly: true,
};
