import type { ReactNode } from "react";
import { CardHeader } from "@/core/ui/page-header";
import { LoadingState, Skeleton } from "@/core/ui/skeleton";
import type { County } from "../../lib/counties";
import { nextDayHours } from "../../lib/weekly";
import { hoursOf, type PlaceWeek } from "../place-week";
import { hourColumn } from "../weekly-view";
import { HourStrip } from "./hour-strip";

const TITLE = "接下來 24 小時";

function Frame({ children }: { children: ReactNode }) {
  return (
    <section aria-labelledby="wx-next-hours" className="card stack wx-wide">
      <CardHeader id="wx-next-hours">{TITLE}</CardHeader>
      {children}
    </section>
  );
}

/** 一直看得到的每小時 讀不到時整區不出現 一週預報照常 */
export async function NextHours({ county, week }: { county: County | null; week: PlaceWeek }) {
  const hours = nextDayHours(await hoursOf(county, week), new Date(), week.utcOffsetSeconds);
  if (hours.length === 0) return null;
  return (
    <Frame>
      <HourStrip hours={hours.map(hourColumn)} label={TITLE} fill />
    </Frame>
  );
}

/** 標題先出現 跟讀到時一樣高 串流進來時下面的區塊不會跳 */
export function NextHoursSkeleton() {
  return (
    <Frame>
      <LoadingState label="載入每小時預報…">
        <Skeleton className="h-34 rounded-xl" />
      </LoadingState>
    </Frame>
  );
}
