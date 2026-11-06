import type { ModuleInfo } from "@/core/module";

export const weatherInfo: ModuleInfo = {
  id: "weather",
  name: "天氣",
  href: "/weather",
  description: "首頁顯示所在縣市的天氣、降雨機率、空氣品質與天氣特報，會下雨時提醒帶傘；天氣頁看台灣與國外城市的一週預報",
  icon: "/icons/ui/cloud-sun.svg",
  accent: "blue",
  cover: "/images/scenes/weather-clear-day.svg",
  services: [
    { id: "weather:forecast", label: "氣象署 天氣預報" },
    { id: "weather:warnings", label: "氣象署 天氣警特報" },
  ],
  crons: [
    { id: "weather:rain", label: "下雨提醒" },
    { id: "weather:warnings", label: "警特報提醒" },
  ],
};
