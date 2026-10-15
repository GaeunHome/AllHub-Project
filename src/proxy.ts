import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/core/auth/session";

/**
 * 沒登入就導向 /login 只驗簽章與期限 不查資料庫才能在 edge 執行
 * 改密碼後的舊 cookie 由 requireSession 擋 外部呼叫的端點自己驗簽章
 */
export async function proxy(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (await verifySessionToken(token, process.env.SESSION_SECRET ?? "")) return NextResponse.next();

  const login = new URL("/login", request.url);
  return NextResponse.redirect(login);
}

export const config = {
  // 排除的路徑要整段比對 否則 /loginx 這類新路由會意外變成公開
  // 排除的是沒登入也要用的頁面 圖片與 robots.txt 以及外部呼叫的端點
  matcher: ["/((?!(?:login|register|terms|icons|robots\\.txt|api/auth/captcha|api/cron|api/twitch/eventsub|api/youtube/websub)(?:/|$)|_next/static|_next/image|favicon.ico).*)"],
};
