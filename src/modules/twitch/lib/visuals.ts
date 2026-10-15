import type { TwitchGame, TwitchStream, TwitchUser } from "./api";

// Helix 的頭像 直播與封面只放快取不存資料庫
// 這裡把回應整理成畫面要的欄位 再跟資料庫的主播合併

/** 直播卡片的預覽圖最寬約 576px 所以用 640x360 */
const PREVIEW = { width: 640, height: 360 };
/**
 * 大面板在 1080p 螢幕約 1460px 寬 2 倍螢幕的筆電要約 2000 像素
 * 用直播本身的 1080p 再大 Twitch 也只是放大
 */
const LARGE_PREVIEW = { width: 1920, height: 1080 };
/** 封面在直播卡片顯示 36x48 主播詳情 60x80 這裡用卡片的兩倍 */
const BOX_ART = { width: 72, height: 96 };

export type StreamerProfile = { id: string; profileImageUrl: string | null; offlineImageUrl: string | null };

export type LiveStream = {
  userId: string;
  title: string | null;
  gameId: string | null;
  gameName: string | null;
  viewerCount: number | null;
  startedAt: string | null;
  previewUrl: string | null;
  largePreviewUrl: string | null;
};

export type GameArt = { id: string; boxArtUrl: string | null };

/** 直播卡片的內容 EventSub 說開台但 Helix 還查不到時都是 null */
export type LiveInfo = {
  title: string | null;
  gameName: string | null;
  boxArtUrl: string | null;
  viewerCount: number | null;
  startedAt: string | null;
  previewUrl: string | null;
  /** 主播詳情的大面板用 */
  largePreviewUrl: string | null;
};

/** 參數會成為快取 key 去重排序後 同一組主播不論順序都共用一份快取 */
export function cacheKeyIds(ids: Array<string | null | undefined>): string[] {
  return [...new Set(ids.filter((id): id is string => !!id))].sort();
}

export function sizedImageUrl(template: string | null | undefined, width: number, height: number): string | null {
  if (!template) return null;
  return template.replace("{width}", String(width)).replace("{height}", String(height));
}

const text = (value: unknown): string | null => (typeof value === "string" && value !== "" ? value : null);

export function toProfile(user: TwitchUser): StreamerProfile {
  return { id: user.id, profileImageUrl: text(user.profile_image_url), offlineImageUrl: text(user.offline_image_url) };
}

export function toLiveStream(stream: TwitchStream): LiveStream {
  return {
    userId: stream.user_id,
    title: text(stream.title),
    gameId: text(stream.game_id),
    gameName: text(stream.game_name),
    viewerCount: typeof stream.viewer_count === "number" && Number.isFinite(stream.viewer_count) ? stream.viewer_count : null,
    startedAt: text(stream.started_at),
    previewUrl: sizedImageUrl(text(stream.thumbnail_url), PREVIEW.width, PREVIEW.height),
    largePreviewUrl: sizedImageUrl(text(stream.thumbnail_url), LARGE_PREVIEW.width, LARGE_PREVIEW.height),
  };
}

export function toGameArt(game: TwitchGame): GameArt {
  return { id: game.id, boxArtUrl: sizedImageUrl(text(game.box_art_url), BOX_ART.width, BOX_ART.height) };
}

/** 像是開台 2 小時 5 分 伺服器時鐘有誤差 開台時間比現在晚也當作剛開台 */
export function formatLiveDuration(startedAt: string | null, now: Date): string | null {
  if (!startedAt) return null;
  const started = Date.parse(startedAt);
  if (Number.isNaN(started)) return null;
  const minutes = Math.floor((now.getTime() - started) / 60_000);
  if (minutes < 1) return "剛開台";
  if (minutes < 60) return `開台 ${minutes} 分鐘`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `開台 ${hours} 小時` : `開台 ${hours} 小時 ${rest} 分`;
}

/** 千分位自己加 不依賴執行環境的語系資料 */
export function formatCount(count: number | null): string | null {
  if (count === null) return null;
  return String(Math.max(0, Math.round(count))).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function formatViewerCount(count: number | null): string | null {
  const digits = formatCount(count);
  return digits === null ? null : `${digits} 人觀看`;
}

type StreamerBase = { broadcasterId: string; login: string; profileImageUrl: string | null; isLive: boolean };

export type StreamerVisual<T extends StreamerBase> = T & { avatarUrl: string | null; bannerUrl: string | null; live: LiveInfo | null };

/** null 代表 Helix 不能用 頭像改用資料庫存的 直播中照 EventSub 寫的 is_live */
export type HelixVisuals = { profiles: StreamerProfile[] | null; streams: LiveStream[] | null; games: GameArt[] | null };

/**
 * EventSub 說開台或 Helix 查得到都算直播中
 * 剛開台時 Helix 常常還查不到 不能因此顯示離線
 */
export function mergeStreamerVisuals<T extends StreamerBase>(streamers: T[], { profiles, streams, games }: HelixVisuals): StreamerVisual<T>[] {
  const profileOf = new Map((profiles ?? []).map((p) => [p.id, p]));
  const streamOf = new Map((streams ?? []).map((s) => [s.userId, s]));
  const boxArtOf = new Map((games ?? []).map((g) => [g.id, g.boxArtUrl]));

  const merged = streamers.map((streamer): StreamerVisual<T> => {
    const profile = profileOf.get(streamer.broadcasterId);
    const stream = streamOf.get(streamer.broadcasterId);
    const isLive = streamer.isLive || stream !== undefined;
    const live: LiveInfo | null = isLive
      ? {
          title: stream?.title ?? null,
          gameName: stream?.gameName ?? null,
          boxArtUrl: (stream?.gameId && boxArtOf.get(stream.gameId)) || null,
          viewerCount: stream?.viewerCount ?? null,
          startedAt: stream?.startedAt ?? null,
          previewUrl: stream?.previewUrl ?? null,
          largePreviewUrl: stream?.largePreviewUrl ?? null,
        }
      : null;
    return { ...streamer, isLive, avatarUrl: profile?.profileImageUrl ?? streamer.profileImageUrl, bannerUrl: profile?.offlineImageUrl ?? null, live };
  });
  return merged.sort((a, b) => Number(b.isLive) - Number(a.isLive) || (a.login < b.login ? -1 : a.login > b.login ? 1 : 0));
}

/** 首頁正在直播最多列幾位 寬螢幕剛好一排 */
const LIVE_NOW_LIMIT = 4;

/**
 * 只留直播中的 順序照 mergeStreamerVisuals 排好的
 * 超過上限的只算人數 讓畫面連到 Twitch 頁看全部
 */
export function pickLiveNow<T extends { isLive: boolean }>(visuals: T[], limit = LIVE_NOW_LIMIT): { shown: T[]; more: number } {
  const live = visuals.filter((s) => s.isLive);
  return { shown: live.slice(0, limit), more: Math.max(0, live.length - limit) };
}
