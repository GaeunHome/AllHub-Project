/** 時間用 ISO 字串 API 與 Server Component 傳給 client 元件才會一樣 */
export type NotificationItem = {
  id: number;
  module: string;
  kind: string;
  title: string;
  body: string;
  url: string | null;
  createdAt: string;
  read: boolean;
};

export type UnreadSummary = { total: number; byModule: Record<string, number> };

/** 輪詢 API 一次帶回鈴鐺數字 各模組未讀數與面板裡的最近通知 */
export type NotificationFeed = { unread: UnreadSummary; recent: NotificationItem[] };

export const EMPTY_FEED: NotificationFeed = { unread: { total: 0, byModule: {} }, recent: [] };
