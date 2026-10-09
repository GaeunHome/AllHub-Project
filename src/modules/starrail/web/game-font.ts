import { Rajdhani } from "next/font/google";

// 遊戲裡的數字是窄、方正的科幻字體，Geist 的數字太像一般的工具軟體；只用在星穹鐵道頁的數字，字型檔在建置時下載、由網站自己提供
export const gameFont = Rajdhani({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-rajdhani", display: "swap" });
