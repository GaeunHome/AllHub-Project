/** YouTube 上的影片頁 */
export const youtubeWatchUrl = (videoId: string) => `https://www.youtube.com/watch?v=${videoId}`;

/** 站內的翻譯觀看頁；service 與 web 不能讀模組根目錄的 info.ts，模組網址（/youtube）寫在這裡 */
export const watchPagePath = (videoId: string) => `/youtube/watch/${videoId}`;
