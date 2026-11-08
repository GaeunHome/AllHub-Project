import { connection } from "next/server";
import { requireSession } from "../auth";
import { SHELL_FRAME } from "../ui/app-header";
import { cachedAnnouncements } from "./cached";
import { tickerItems } from "./ticker";
import { TickerBar } from "./ticker-bar";

/** 全站導覽列上面 沒有要放的公告時整條不出現 */
export async function AnnouncementTicker() {
  await requireSession();
  // 結束時間過了要馬上拿掉 所以用這次請求的時間算
  await connection();
  const items = tickerItems(await cachedAnnouncements(), new Date());
  return items.length > 0 ? <TickerBar items={items} frame={SHELL_FRAME} /> : null;
}
