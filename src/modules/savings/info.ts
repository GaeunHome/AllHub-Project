import type { ModuleInfo } from "@/core/module";

export const savingsInfo: ModuleInfo = {
  id: "savings",
  name: "理財",
  href: "/savings",
  description: "記下收入、支出與轉帳，看每個帳戶的餘額、預算、持股與信用卡帳單",
  icon: "/icons/ui/wallet.svg",
  cover: "/images/scenes/module-savings.svg",
  accent: "green",
  services: [{ id: "savings:dividends", label: "證交所與櫃買中心 除權息預告" }],
};
