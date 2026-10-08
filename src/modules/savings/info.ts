import type { ModuleInfo } from "@/core/module";

export const savingsInfo: ModuleInfo = {
  id: "savings",
  name: "存錢記帳",
  href: "/savings",
  description: "記下每個月固定要存的錢：這個月存了沒、今年和全部累計多少；紀錄永久保留",
  icon: "/icons/ui/piggy-bank.svg",
  accent: "mint",
  notifies: false,
};
