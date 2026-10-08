import { formatTaipeiMonthDay } from "@/core/time";
import type { TranslationStatus, ZhCaptionStatus } from "../data/schema";

/** 資料庫存 pending／subscribed，或直接是中文的失敗原因 */
export function describeChannelStatus(status: string | null, leaseExpiresAt: Date | null, now = new Date()): string {
  if (!status) return "未訂閱";
  if (status === "pending") return "等待 hub 確認";
  if (status === "subscribed") {
    if (!leaseExpiresAt) return "正常";
    const date = formatTaipeiMonthDay(leaseExpiresAt);
    return leaseExpiresAt > now ? `正常（${date} 到期，會自動續訂）` : `租約已過期（${date}），等待續訂`;
  }
  return status;
}

export function describeTranslationStatus(status: TranslationStatus | null): string {
  switch (status) {
    case null:
      return "翻譯觀看";
    case "queued":
    case "running":
      return "翻譯中";
    case "done":
      return "觀看（已翻譯）";
    case "failed":
      return "翻譯失敗";
  }
}

/** 狀態除了顏色還有文字；「沒有」用一般外觀，不必搶眼 */
export function describeZhCaptions(status: ZhCaptionStatus): { label: string; chip: string } {
  switch (status) {
    case "yes":
      return { label: "有中文字幕", chip: "chip chip-success" };
    case "no":
      return { label: "沒有中文字幕", chip: "chip" };
    case "unknown":
      return { label: "字幕未確認", chip: "chip chip-warning" };
  }
}
