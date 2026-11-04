import type { ReactNode } from "react";
import { FactList } from "@/core/ui/fact-list";
import { formatTwd } from "../../../lib/money";
import { BIG_FIGURE, BIG_FIGURE_FACTS } from "./layout";

/** 橫幅裡的一個大數字 旁邊是幾列合計 總覽與投資共用 */
export function BannerFigure({ id, label, amount, facts }: { id: string; label: string; amount: number; facts?: ReactNode }) {
  return (
    <section aria-labelledby={id} className={BIG_FIGURE}>
      <div className="flex min-w-0 flex-col gap-1">
        <h2 id={id} className="font-medium text-white/90">
          {label}
        </h2>
        <p className="text-5xl font-bold tracking-tight text-white tabular-nums sm:text-6xl">{formatTwd(amount)}</p>
      </div>
      {facts && <FactList className={`scene-facts rounded-xl bg-black/40 px-4 ${BIG_FIGURE_FACTS}`}>{facts}</FactList>}
    </section>
  );
}
