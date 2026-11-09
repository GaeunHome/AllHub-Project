import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/core/auth/session";

/**
 * 只驗簽章與期限 不查資料庫才能在 edge 執行
 * 舊 cookie 由 requireSession 擋 外部呼叫的端點自己驗簽章
 */
/** 要登入才讀得到的圖 檔名沒有雜湊 瀏覽器先用一天 重新整理時不用一張張問 */
const PRIVATE_ASSETS = /^\/(?:images|illustrations)\//;
const PRIVATE_ASSET_CACHE = "private, max-age=86400, stale-while-revalidate=604800";

export async function proxy(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (await verifySessionToken(token, process.env.SESSION_SECRET ?? "")) {
    const response = NextResponse.next();
    // 只加在放行的回應上 導回登入頁的轉址不能被記住
    if (PRIVATE_ASSETS.test(request.nextUrl.pathname)) response.headers.set("Cache-Control", PRIVATE_ASSET_CACHE);
    return response;
  }

  const login = new URL("/login", request.url);
  // 群組連結傳給還沒登入的朋友 登入後要回到這裡
  if (request.nextUrl.pathname.startsWith("/travel/join/")) login.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(login);
}

export const config = {
  // 整段比對 否則 /loginx 這類新路由會意外變成公開
  // 排除沒登入也要用的頁面與檔 以及外部呼叫的端點
  matcher: ["/((?!(?:login|register|terms|icons|robots\\.txt|manifest\\.webmanifest|sw\\.js|api/auth/captcha|api/cron|api/twitch/eventsub|api/youtube/websub)(?:/|$)|_next/static|_next/image|favicon.ico).*)"],
};
