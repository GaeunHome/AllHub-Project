import type { ModuleInfo } from "@/core/module";

export const transitInfo: ModuleInfo = {
  id: "transit",
  name: "交通",
  href: "/transit",
  description: "常用路線與下一班車的倒數，查高鐵、台鐵、捷運與公車的班次",
  icon: "/icons/ui/bus.svg",
  cover: "/images/scenes/module-transit.svg",
  accent: "green",
  notifies: false,
  services: [{ id: "transit:tdx", label: "TDX 交通資料" }],
};
