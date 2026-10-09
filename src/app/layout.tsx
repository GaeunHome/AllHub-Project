import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { NO_INDEX } from "@/core/robots";
import { THEME_INIT_SCRIPT } from "@/core/ui/theme";
import { ThemeSync } from "@/core/ui/theme-sync";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AllHub Project",
  description: "個人整合系統",
  robots: NO_INDEX,
};

// 手機瀏覽器的網址列跟著頁面背景換色，深色模式時才不會頂著一條亮色
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7f9" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1012" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // <head> 的腳本在 React 接手前就設好 data-theme，屬性跟伺服器算繪的不同是預期的
    <html lang="zh-Hant" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        {/* 同步執行：第一次繪製前就套用存著的主題，深色模式不會先閃一下淺色 */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">
        <ThemeSync />
        {children}
      </body>
    </html>
  );
}
