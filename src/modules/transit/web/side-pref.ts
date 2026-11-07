import { htmlFlagScript, setHtmlFlag, type HtmlRoot } from "@/core/ui/html-flag";
import { createLocalPref } from "@/core/ui/local-pref";

// 使用者要的 常用路線的側邊欄可以收起來 偏好存在瀏覽器 跨分頁同步

type SideState = "open" | "closed";

const KEY = "allhub:transit:side";

const sidePref = createLocalPref<SideState>({
  key: KEY,
  defaultValue: "open",
  parse: (stored) => (stored === "open" || stored === "closed" ? stored : undefined),
});

export const readSide = sidePref.read;
export const saveSide = sidePref.save;
export const subscribeSide = sidePref.subscribe;
export const useSide = sidePref.useValue;

/** 收起時標在 html 上 伺服器讀不到瀏覽器的偏好 web/transit.css 依它排版 */
const SIDE_CLOSED_ATTRIBUTE = "data-transit-side-closed";

// 整頁載入時第一次繪製前就標好 側邊欄才不會先開再收
export const SIDE_INIT_SCRIPT = htmlFlagScript(KEY, "closed", SIDE_CLOSED_ATTRIBUTE);

export const applySide = (root: HtmlRoot, state: SideState): void => setHtmlFlag(root, SIDE_CLOSED_ATTRIBUTE, state === "closed");
