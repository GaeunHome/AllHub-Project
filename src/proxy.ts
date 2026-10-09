import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/core/auth/session";

/** 沒登入就導向 /login；只驗簽章與期限、不查資料庫（維持 edge 可用），改密碼後的舊 cookie 由 requireSession 擋；外部服務呼叫的端點自己驗簽章 */
export async function proxy(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (await verifySessionToken(token, process.env.SESSION_SECRET ?? "")) return NextResponse.next();

  const login = new URL("/login", request.url);
  return NextResponse.redirect(login);
}

export const config = {
  // 排除的路徑要整段比對（後面接 / 或結尾），否則 /loginx、/api/cronfoo 之類的新路由會意外變成公開；register 要讓拿到邀請連結的人打得開、terms 是登入與註冊前就要能讀的聲明、api/auth/captcha 是登入與註冊頁的驗證碼圖片；icons 是登入頁也要用的開源圖示，robots.txt 要讓沒登入的爬蟲讀得到
  matcher: ["/((?!(?:login|register|terms|icons|robots\\.txt|api/auth/captcha|api/cron|api/twitch/eventsub|api/youtube/websub)(?:/|$)|_next/static|_next/image|favicon.ico).*)"],
};
