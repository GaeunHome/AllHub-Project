// 站內的星穹鐵道頁與 HoYoLAB 的網址 web 與 service 都不能讀模組根目錄的 info.ts 寫在這裡

export const STARRAIL_HREF = "/starrail";

/** 頁面一次只看一個帳號 選擇放在網址參數 */
export const accountHref = (accountId: number) => `${STARRAIL_HREF}?account=${accountId}`;

/** 每日簽到的活動 HoYoLAB 改版時可能換掉 */
export const CHECKIN_ACT_ID = "e202303301540311";

/** 簽到的通知連到 HoYoLAB 的簽到頁 */
export const CHECKIN_PAGE = `https://act.hoyolab.com/bbs/event/signin/hkrpg/index.html?act_id=${CHECKIN_ACT_ID}`;
