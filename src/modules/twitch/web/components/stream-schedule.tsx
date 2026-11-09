import { nextStartText, segmentTime, upcomingSegments, vacationText } from "../../lib/schedule";
import { cachedSchedule } from "../../service/cached";

// 使用者選的清單＋詳情 離線的主播在清單寫下次開台 詳情列出接下來幾次與休假
// now 由清單傳進來 同一頁用同一個時間

/** 清單上取代離線兩個字 沒有排或讀不到照舊寫離線 */
export async function NextStart({ broadcasterId, now }: { broadcasterId: string; now: Date }) {
  const { schedule } = await cachedSchedule(broadcasterId);
  const [next] = schedule ? upcomingSegments(schedule, now, 1) : [];
  return next ? nextStartText(next.start, now) : "離線";
}

/** 詳情右欄的一塊 沒設定 Twitch 憑證時整塊不放 */
export async function SchedulePanel({ broadcasterId, now }: { broadcasterId: string; now: Date }) {
  const { configured, schedule } = await cachedSchedule(broadcasterId);
  if (!configured) return null;
  const segments = schedule ? upcomingSegments(schedule, now) : [];
  const vacation = schedule?.vacation && Date.parse(schedule.vacation.end) > now.getTime() ? schedule.vacation : null;
  const headingId = `tw-schedule-${broadcasterId}`;
  return (
    <section aria-labelledby={headingId} className="panel stack gap-3">
      <h3 id={headingId} className="font-medium text-ink">
        開台時間表
      </h3>
      {schedule === null ? (
        <p className="text-ink">開台時間表暫時無法讀取</p>
      ) : segments.length === 0 && !vacation ? (
        <p className="text-ink">沒有公布開台時間表</p>
      ) : (
        <ul className="stack gap-3">
          {segments.map((segment) => (
            <li key={segment.start} className="flex flex-col gap-0.5">
              <span className="font-semibold text-ink tabular-nums">{segmentTime(segment)}</span>
              {(segment.title || segment.category) && (
                <span className="flex flex-wrap gap-x-3 text-ink">
                  {segment.title && <span className="break-words">{segment.title}</span>}
                  {segment.category && <span className="text-brand-ink">{segment.category}</span>}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {vacation && <p className="font-medium text-ink">{vacationText(vacation)}</p>}
    </section>
  );
}
