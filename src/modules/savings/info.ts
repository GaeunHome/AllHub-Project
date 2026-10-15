import type { ModuleInfo } from "@/core/module";

export const savingsInfo: ModuleInfo = {
  id: "savings",
  name: "理財",
  href: "/savings",
  description: "記下收入、支出與轉帳，看每個帳戶的餘額、預算與資產分布",
  icon: "/icons/ui/wallet.svg",
  accent: "green",
  notifies: false,
};
