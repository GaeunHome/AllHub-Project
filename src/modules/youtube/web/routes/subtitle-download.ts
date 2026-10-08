import { currentSession } from "@/core/auth";
import { buildSubtitleFile, parseDownloadQuery } from "../../lib/download";
import { parseVideoId } from "../../lib/parse";
import { getTranslation } from "../../service/translation";

/** 下載翻譯後的字幕檔。proxy 只驗簽章，這裡再比對資料庫的 session 版本（改密碼後的舊 cookie）；Route Handler 不轉址，回 401 */
export async function GET(request: Request, { params }: RouteContext<"/api/youtube/subtitles/[videoId]">) {
  if (!(await currentSession())) return Response.json({ error: "unauthorized" }, { status: 401 });
  const videoId = parseVideoId((await params).videoId);
  const query = parseDownloadQuery(new URL(request.url).searchParams);
  if (!videoId || !query) return Response.json({ error: "參數不正確" }, { status: 400 });

  const translation = await getTranslation(videoId);
  if (!translation) return Response.json({ error: "這支影片還沒有翻譯" }, { status: 404 });

  const body = buildSubtitleFile(translation.sourceCues, translation.translated, query.lang, query.format);
  return new Response(body, {
    headers: {
      "Content-Type": query.format === "srt" ? "application/x-subrip; charset=utf-8" : "text/vtt; charset=utf-8",
      "Content-Disposition": `attachment; filename="${videoId}.${query.lang}.${query.format}"`,
      "Cache-Control": "no-store",
    },
  });
}
