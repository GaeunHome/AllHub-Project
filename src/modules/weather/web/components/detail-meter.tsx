import type { CSSProperties } from "react";
import { Icon } from "@/core/ui/icon";
import type { DetailMeter } from "../weekly-view";

type Meter = DetailMeter | { kind: "aqi"; at: number };

/** 使用者選的小量表 數字與等級已經寫在格子裡 量表只是一眼看出高低 報讀器不念 */
export function MeterBar({ meter }: { meter: Meter }) {
  if (meter.kind === "toward") {
    return (
      <span aria-hidden="true" className="wx-compass">
        <span className="wx-compass-arrow" style={{ rotate: `${meter.degrees}deg` }}>
          <Icon name="arrow-up" className="size-5" />
        </span>
      </span>
    );
  }
  return <span aria-hidden="true" className="wx-meter" data-kind={meter.kind} style={{ "--wx-at": `${meter.at}%` } as CSSProperties} />;
}
