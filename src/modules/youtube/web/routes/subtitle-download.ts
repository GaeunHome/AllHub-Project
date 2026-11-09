import "server-only";
import { NO_STORE, jsonResponse, withSession } from "@/core/api-route";
import { buildSubtitleFile, parseDownloadQuery } from "../../lib/download";
import { parseVideoId } from "../../lib/parse";
import { getTranslation } from "../../service/translation";

/**
 * proxy 只驗簽章 這裡再比對資料庫 擋下改密碼前的舊 cookie
 * Route Handler 不轉址 直接回 401
 */
export function GET(request: Request, { params }: RouteContext<"/api/youtube/subtitles/[videoId]">): Promise<Response> {
  return withSession({ scope: "youtube", failure: "字幕暫時無法下載", module: "youtube" }, async () => {
    const videoId = parseVideoId((await params).videoId);
    const query = parseDownloadQuery(new URL(request.url).searchParams);
    if (!videoId || !query) return jsonResponse({ error: "參數不正確" }, 400);

    const translation = await getTranslation(videoId);
    if (!translation) return jsonResponse({ error: "這支影片還沒有翻譯" }, 404);

    const body = buildSubtitleFile(translation.sourceCues, translation.translated, query.lang, query.format);
    return new Response(body, {
      headers: {
        ...NO_STORE,
        "Content-Type": query.format === "srt" ? "application/x-subrip; charset=utf-8" : "text/vtt; charset=utf-8",
        "Content-Disposition": `attachment; filename="${videoId}.${query.lang}.${query.format}"`,
      },
    });
  });
}
