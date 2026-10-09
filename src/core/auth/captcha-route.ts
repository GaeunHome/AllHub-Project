import "server-only";
import { connection, type NextRequest } from "next/server";
import { issueCaptcha } from "./captcha";
import { CAPTCHA_PURPOSES, type CaptchaPurpose } from "./messages";

// GET /api/auth/captcha?for=login|register：公開的路由（proxy 不擋），登入頁與註冊頁的圖片從這裡載入

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

const isPurpose = (value: string | null): value is CaptchaPurpose => (CAPTCHA_PURPOSES as readonly (string | null)[]).includes(value);

export async function GET(request: NextRequest): Promise<Response> {
  // 每次都要新的驗證碼與 cookie，不能在建置時預先算好
  await connection();
  const purposes = request.nextUrl.searchParams.getAll("for");
  const purpose = purposes.length === 1 ? purposes[0] : null;
  if (!isPurpose(purpose)) return new Response("unknown purpose", { status: 400, headers: NO_STORE });

  const svg = await issueCaptcha(purpose);
  return new Response(svg, {
    headers: {
      ...NO_STORE,
      "Content-Type": "image/svg+xml; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      // 直接打開這個網址時，SVG 也不能執行任何東西
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
    },
  });
}
