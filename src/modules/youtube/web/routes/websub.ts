import { after } from "next/server";
import { youtubeEnv } from "@/core/env";
import { handleFeed, handleVerification } from "../../service/channels";
import { parseFeed, parseVerification, verifyHubSignature } from "../../lib/websub";

/** WebSub hub 確認訂閱：callback 上的 k 要對、而且是追蹤中的頻道才回 challenge，其餘 404 讓 hub 放棄 */
export async function GET(request: Request) {
  const verification = parseVerification(new URL(request.url).searchParams);
  const challenge = verification ? await handleVerification(verification) : null;
  if (challenge === null) return new Response(null, { status: 404 });
  return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
}

/** 新影片推送不走登入、靠 HMAC 簽章驗證；簽章不符仍回 2xx 只是忽略內容（WebSub 規範建議，避免洩漏驗證結果、也避免 hub 一直重送） */
export async function POST(request: Request) {
  const raw = await request.text();
  if (!verifyHubSignature(raw, request.headers.get("x-hub-signature"), youtubeEnv().YOUTUBE_WEBSUB_SECRET)) {
    console.warn("[youtube] 忽略簽章不符的 WebSub 推送");
    return new Response(null, { status: 204 });
  }

  await handleFeed(parseFeed(raw).entries, { defer: after });
  return new Response(null, { status: 204 });
}
