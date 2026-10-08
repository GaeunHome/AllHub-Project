/** 給瀏覽器的通知格式：時間用 ISO 字串，API 與 Server Component 傳給 client 元件都一樣 */
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

/** 輪詢 API 一次帶回的內容：鈴鐺數字、導覽列各模組的未讀數、面板裡的最近通知 */
export type NotificationFeed = { unread: UnreadSummary; recent: NotificationItem[] };

export const EMPTY_FEED: NotificationFeed = { unread: { total: 0, byModule: {} }, recent: [] };
