import { after } from "next/server";
import { youtubeEnv } from "@/core/env";
import { handleFeed, handleVerification } from "../../service/channels";
import { parseFeed, parseVerification, verifyHubSignature } from "../../lib/websub";

/** hub 確認訂閱時 k 要對又是追蹤中的頻道才回 challenge 其餘 404 讓 hub 放棄 */
export async function GET(request: Request) {
  const verification = parseVerification(new URL(request.url).searchParams);
  const challenge = verification ? await handleVerification(verification) : null;
  if (challenge === null) return new Response(null, { status: 404 });
  return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
}

/**
 * 新影片推送不走登入 靠 HMAC 簽章驗證
 * 簽章不符照 WebSub 規範仍回 2xx 只忽略內容 不洩漏驗證結果也不會一直重送
 */
export async function POST(request: Request) {
  const raw = await request.text();
  if (!verifyHubSignature(raw, request.headers.get("x-hub-signature"), youtubeEnv().YOUTUBE_WEBSUB_SECRET)) {
    console.warn("[youtube] 忽略簽章不符的 WebSub 推送");
    return new Response(null, { status: 204 });
  }

  await handleFeed(parseFeed(raw).entries, { defer: after });
  return new Response(null, { status: 204 });
}
