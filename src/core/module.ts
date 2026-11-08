/** 對應 globals.css 的 data-accent 色值集中在 CSS 深色模式才能一起切換 */
export type ModuleAccent = "blue" | "red" | "violet" | "gold" | "green";

/** 每個模組對外公開的資訊 首頁與導覽列只讀這裡 不碰模組內部 */
export type ModuleInfo = {
  id: string;
  name: string;
  href: `/${string}`;
  description: string;
  /** public/ 底下的單色 SVG 用 CSS mask 才能套上點綴色 */
  icon: `/${string}.svg`;
  accent?: ModuleAccent;
  /** 首頁入口的背景圖 只有首頁卡片的模組沒有入口 不用填 */
  cover?: `/${string}.svg`;
  /** 不呼叫 notify 的模組設 false 提醒方式才不會多一排沒用的開關 architecture.test 會檢查 */
  notifies?: boolean;
  /** 只有首頁卡片 沒有自己的頁面 導覽列與首頁的模組入口不列出 href 填首頁 */
  homeOnly?: boolean;
  /**
   * 系統狀態頁照這份列出外部服務
   * id 是給 reportService 的 模組 id 開頭
   */
  services?: { id: `${string}:${string}`; label: string }[];
  /** 排程的中文名稱 系統狀態頁用 id 跟 cron 網址一樣 modules/__tests__/cron.test 會檢查 */
  crons?: { id: `${string}:${string}`; label: string }[];
};

/** 只有首頁卡片的模組沒有頁面 不放進導覽列與首頁的模組入口 */
export const pageModules = <T extends Pick<ModuleInfo, "homeOnly">>(modules: readonly T[]): T[] => modules.filter((m) => !m.homeOnly);

/** 回傳的摘要會寫進 /api/cron 的回應與站長的系統狀態頁 不能夾帶憑證 原始錯誤與成員的資料 */
export type CronTask = () => Promise<string>;

/** src/app 的頁面交給頁面元件的網址參數 同一個名稱出現好幾次時是陣列 */
export type SearchParams = Promise<Record<string, string | string[] | undefined>>;
