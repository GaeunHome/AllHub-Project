import { formatTaipeiMonthDay } from "@/core/time";
import type { StatusBadge } from "@/core/ui/status-chip";
import type { TranslationStatus, ZhCaptionStatus } from "../data/schema";

const FAILURE_PREFIX = "訂閱失敗：";

/** 頻道列上的訂閱狀態標籤；失敗原因與到期日放在 detail，需要時才顯示 */
export function channelStatusBadge(status: string | null, leaseExpiresAt: Date | null, now = new Date()): StatusBadge {
  if (!status) return { label: "未訂閱", tone: "warning", detail: null };
  if (status === "pending") return { label: "等待 hub 確認", tone: "warning", detail: null };
  if (status === "subscribed") {
    if (!leaseExpiresAt) return { label: "訂閱正常", tone: "success", detail: null };
    if (leaseExpiresAt > now) return { label: "訂閱正常", tone: "success", detail: `${formatTaipeiMonthDay(leaseExpiresAt)} 到期，會自動續訂` };
    return { label: "租約過期，等待續訂", tone: "warning", detail: null };
  }
  return { label: "訂閱失敗", tone: "danger", detail: status.startsWith(FAILURE_PREFIX) ? status.slice(FAILURE_PREFIX.length) : status };
}

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
