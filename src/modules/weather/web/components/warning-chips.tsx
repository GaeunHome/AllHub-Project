import { StatusChip } from "@/core/ui/status-chip";
import type { WarningChip } from "../weather-view";

/**
 * 超長的特報最寬到外框的內容 在標籤內換行 結束時間才看得到
 * 圓角 12px 比一行的半高大 一行時還是膠囊 多行時字才不會超出轉角
 */
const WARNING_CHIP = "max-w-full rounded-xl whitespace-normal";

/** 首頁卡片與天氣頁共用 */
export function WarningChips({ chips }: { chips: WarningChip[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map((chip) => (
        <StatusChip key={chip.label} badge={chip} className={WARNING_CHIP} />
      ))}
    </div>
  );
}
