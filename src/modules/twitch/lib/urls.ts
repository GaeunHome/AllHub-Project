// service 與 web 不能讀根目錄的 info.ts 站內與 Twitch 的網址寫在這裡

/** 站內的 Twitch 頁 */
export const TWITCH_PAGE_PATH = "/twitch";

/** 主播在 Twitch 上的頻道 */
export const twitchChannelUrl = (login: string) => `https://twitch.tv/${login}`;

/** 接受 login @login 或 twitch.tv/login 網址 */
export function normalizeLogin(input: string): string {
  return input
    .trim()
    .replace(/^(https?:\/\/)?(www\.)?twitch\.tv\//i, "")
    .replace(/^@/, "")
    .split(/[/?#]/)[0]
    .toLowerCase();
}
