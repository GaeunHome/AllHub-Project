import { Rajdhani } from "next/font/google";

// 遊戲的數字是窄而方正的科幻字體 Geist 太像一般工具軟體
// 只用在星穹鐵道頁的數字 字型檔建置時下載由網站自己提供
export const gameFont = Rajdhani({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-rajdhani", display: "swap" });
