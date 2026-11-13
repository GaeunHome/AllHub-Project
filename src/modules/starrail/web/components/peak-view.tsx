import { ExternalImage } from "@/core/ui/external-image";
import { Icon } from "@/core/ui/icon";
import type { EndgameSchedule } from "../../lib/endgame";
import type { Peak, PeakBoss, PeakSeason, PeakStage } from "../../lib/peak";
import { BuffLine, Figure, Team, type Names } from "./endgame-parts";
import { NoRecordNotice, QuickClear, RoundCount, StarRow } from "./sr-visuals";

const KNIGHT_LABELS = ["騎士一", "騎士二", "騎士三"];

/** HoYoLAB 一次回最近三期 新的在前 本期是第一個 上期是第二個 */
export function peakSeasonFor(peak: Peak, schedule: EndgameSchedule): PeakSeason | null {
  return peak.seasons[schedule === "current" ? 0 : 1] ?? null;
}

/** 使用者選的 王棋在上用首領大圖 三個騎士在下並排 */
export function PeakView({ season, names }: { season: PeakSeason | null; names: Names }) {
  if (!season || !season.hasData) return <NoRecordNotice name={season?.name ?? null} />;
  return (
    <div className="stack @container">
      <SeasonSummary season={season} />
      <BossCard boss={season.boss} names={names} />
      <ul className="grid gap-4 @3xl:grid-cols-3">
        {season.knights.map((knight, i) => (
          <KnightCard key={`${knight.name}-${i}`} knight={knight} label={KNIGHT_LABELS[i] ?? `騎士${i + 1}`} names={names} />
        ))}
      </ul>
    </div>
  );
}

function SeasonSummary({ season }: { season: PeakSeason }) {
  return (
    <div className="sr-panel sr-peak-summary">
      {season.theme && (
        <span aria-hidden className="sr-peak-theme">
          <ExternalImage src={season.theme} alt="" fill className="object-cover" />
        </span>
      )}
      <div className="sr-peak-info flex min-w-0 flex-col gap-1.5">
        <p className="text-lg font-bold tracking-wide text-ink">{season.name ?? "異相仲裁"}</p>
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink">
          {season.version && <span className="sr-num">版本 {season.version}</span>}
          {(season.begin || season.end) && (
            <span className="flex items-center gap-1.5">
              <Icon name="calendar" className="size-3.5 text-sr-gold" />
              {season.begin ?? "?"} – {season.end ?? "?"}
            </span>
          )}
        </p>
      </div>
      <dl className="sr-peak-figures flex items-end gap-6">
        <Figure label="王棋">
          <span className="sr-stars-boss">★</span>
          {season.bossStars ?? "—"}
        </Figure>
        <Figure label="騎士">
          <span className="text-sr-gold">★</span>
          {season.knightStars ?? "—"}
        </Figure>
        <Figure label="挑戰">
          {season.battles ?? "—"}
          <span className="text-base font-semibold"> 次</span>
        </Figure>
      </dl>
      {season.boss.medal && (
        <span className="sr-peak-medal">
          <ExternalImage src={season.boss.medal} alt="評級勳章" fill className="object-contain" />
        </span>
      )}
    </div>
  );
}

/** 首領的大圖放在右半邊往左淡出 名稱 星數與隊伍在左邊 */
function BossCard({ boss, names }: { boss: PeakBoss; names: Names }) {
  return (
    <article aria-label={`王棋：${boss.name ?? ""}`} className="sr-panel sr-peak-boss">
      {boss.icon && (
        <span aria-hidden className="sr-peak-boss-art">
          <ExternalImage src={boss.icon} alt="" fill className="object-contain object-right-bottom" />
        </span>
      )}
      <div className="sr-peak-boss-body">
        <p className="sr-kicker">王棋</p>
        <h4 className="flex flex-wrap items-baseline gap-x-2.5 text-2xl font-bold text-ink">
          {boss.hardMode && <span className="sr-hard">{boss.hardModeName ?? "高難度"}</span>}
          {boss.name ?? "（未知首領）"}
        </h4>
        {boss.cleared ? (
          <>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <StarRow stars={boss.stars} label="王棋" tone="boss" />
              {boss.rounds !== null && <RoundCount rounds={boss.rounds} />}
            </div>
            {boss.buff && <BuffLine buff={boss.buff} />}
            <div className="[--sr-team:4.5rem]">
              <Team avatars={boss.avatars} names={names} />
            </div>
          </>
        ) : (
          <p className="text-ink">這一期還沒挑戰王棋</p>
        )}
      </div>
    </article>
  );
}

/** 卡片夠寬時 例如平板直放一欄一張 左邊名稱與星數 右邊隊伍 三欄並排時上下排 */
function KnightCard({ knight, label, names }: { knight: PeakStage; label: string; names: Names }) {
  return (
    <li className="sr-panel sr-peak-knight @container">
      <div className="flex flex-col gap-3.5 @lg:flex-row @lg:items-center @lg:justify-between @lg:gap-6">
        <div className="flex min-w-0 flex-col gap-3.5">
          <div className="flex items-center gap-3">
            <span aria-hidden className="sr-peak-monster">
              <ExternalImage src={knight.icon} alt="" fill className="object-cover" fallback={<Icon name="shield" className="size-5 text-sr-gold" />} />
            </span>
            <div className="min-w-0">
              <p className="sr-kicker">{label}</p>
              <p className="truncate font-semibold text-ink">{knight.name ?? "（未知關卡）"}</p>
            </div>
          </div>
          {knight.cleared ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
              <StarRow stars={knight.stars} label="騎士" />
              {knight.rounds !== null && <RoundCount rounds={knight.rounds} />}
              {knight.quickClear && <QuickClear />}
            </div>
          ) : (
            <p className="text-ink">還沒挑戰</p>
          )}
        </div>
        {knight.cleared && (
          <div className="sr-knight-team">
            <Team avatars={knight.avatars} names={names} />
          </div>
        )}
      </div>
    </li>
  );
}
