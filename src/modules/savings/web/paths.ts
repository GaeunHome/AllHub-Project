// web 層不能讀模組根目錄的 info.ts 網址集中在這裡 改網址只改一處
export const SAVINGS_PATHS = {
  overview: "/savings",
  records: "/savings/records",
  settings: "/savings/settings",
  accounts: "/savings/settings#accounts",
  // 給總覽與紀錄頁的空狀態用 打開設定頁就跳出新增帳戶的視窗
  addAccount: "/savings/settings?add=account#accounts",
  categories: "/savings/settings#categories",
} as const;
