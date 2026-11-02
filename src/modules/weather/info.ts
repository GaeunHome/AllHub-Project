import type { ModuleInfo } from "@/core/module";

export const weatherInfo: ModuleInfo = {
  id: "weather",
  name: "天氣",
  href: "/",
  description: "首頁顯示所在縣市的天氣、降雨機率、空氣品質與天氣特報，會下雨時提醒帶傘",
  icon: "/icons/ui/cloud-sun.svg",
  accent: "blue",
  homeOnly: true,
};
