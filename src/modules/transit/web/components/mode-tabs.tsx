import type { CSSProperties } from "react";
import { Icon, type UiIconName } from "@/core/ui/icon";
import { MODE_COLORS } from "../../lib/lines";
import { MODES, MODE_LABELS, type Mode } from "../../lib/modes";

const MODE_ICONS: Record<Mode, UiIconName> = { thsr: "train-front", tra: "tram-front", metro: "train-front-tunnel", bus: "bus" };

/** 查詢卡最上面的分頁 使用者選的 顏色跟路線圖一樣 */
export function ModeTabs({ value, onChange }: { value: Mode; onChange: (mode: Mode) => void }) {
  return (
    <div role="group" aria-label="交通工具" className="trn-modes">
      {MODES.map((mode) => (
        <button key={mode} type="button" aria-pressed={mode === value} onClick={() => onChange(mode)} className="trn-mode" style={{ "--trn-line": MODE_COLORS[mode] } as CSSProperties}>
          <Icon name={MODE_ICONS[mode]} className="size-5" />
          {MODE_LABELS[mode]}
        </button>
      ))}
    </div>
  );
}
