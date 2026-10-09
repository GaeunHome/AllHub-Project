/** 對應 globals.css 的 data-accent（模組的品牌色，只用在圖示與小標籤）；色值集中在 CSS，深色模式才能一起切換 */
export type ModuleAccent = "blue" | "red" | "violet" | "gold" | "green";

/** 每個模組對外公開的資訊；首頁與導覽列只讀這裡，不碰模組內部 */
export type ModuleInfo = {
  id: string;
  name: string;
  href: `/${string}`;
  description: string;
  /** public/ 底下的單色 SVG（例如 "/icons/brands/youtube.svg"），用 CSS mask 才能套上點綴色 */
  icon?: `/${string}.svg`;
  accent?: ModuleAccent;
  /** 不會呼叫 notify() 的模組設 false，「提醒方式」才不會多一排沒用的開關（architecture.test 檢查） */
  notifies?: boolean;
};

/** 回傳的摘要會原樣寫進 /api/cron 的回應，不能夾帶憑證或原始錯誤 */
export type CronTask = () => Promise<string>;
