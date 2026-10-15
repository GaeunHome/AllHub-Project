/** CSS 的動畫由 globals.css 關掉 JS 的動態看這個 例如數字往上數 平滑捲動 */
export const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
