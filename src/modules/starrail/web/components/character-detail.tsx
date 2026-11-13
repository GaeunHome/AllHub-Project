import type { ReactNode } from "react";
import { ExternalImage } from "@/core/ui/external-image";
import { Icon, type UiIconName } from "@/core/ui/icon";
import { InfoTip } from "@/core/ui/info-tip";
import {
  elementLabel,
  pathLabel,
  relicSlotLabel,
  relicUpgrades,
  type Eidolon,
  type LightCone,
  type Relic,
  type RelicStat,
  type StarrailCharacter,
  type StatLine,
  type Trace,
} from "../../lib/characters";
import type { RelicGrade, RelicRating } from "../../lib/relic-score";
import { CharacterStage } from "./character-stage";
import { ElementBadge, GameIcon, GoldChip, rarityClass } from "./sr-visuals";

const dash = (value: string | number | null) => (value === null || value === "" ? "—" : value);
const stars = (rarity: number | null) => (rarity ? "★".repeat(Math.min(rarity, 5)) : null);

/**
 * 滿版的角色詳情 寬螢幕立繪佔畫面大半 文字留在右邊窄窄的一欄
 * 手機上直排 讀不到的欄位顯示橫線
 */
export function CharacterDetail({ character, titleId, onClose }: { character: StarrailCharacter; titleId: string; onClose: () => void }) {
  const c = character;
  const traces = c.traces.filter((t) => t.kind !== "bonus");
  const bonuses = c.traces.filter((t) => t.kind === "bonus");
  return (
    // 寬螢幕整個面板同一個捲動區 游標在立繪上也捲得動
    // container-type 設成 size 立繪才拿得到面板的高度
    <div className="flex flex-col lg:h-full lg:flex-row lg:items-start lg:overflow-y-auto lg:overscroll-contain lg:[container-type:size]">
      <CharacterStage character={c} />

      {/* 右欄在手機上用 contents 拆開 標題列才排得到立繪前面 */}
      <div className="contents lg:block lg:min-w-0 lg:flex-1">
        <DetailHeader character={c} titleId={titleId} onClose={onClose} />

        {/* 用容器查詢依右欄自己的寬度分欄 遺器與行跡橫跨兩欄 */}
        <div className="@container order-3 min-w-0 p-4 sm:p-6 lg:order-none">
          <div className="grid gap-8 @3xl:grid-cols-2">
            <Section title="面板" icon="chart-column">
              {c.stats.length > 0 ? <StatsTable stats={c.stats} /> : <p className="text-ink-soft">沒有面板資料</p>}
            </Section>

            <div className="page-stack min-w-0">
              <Section title="光錐" icon="sparkles">
                {c.lightCone ? <LightConeCard lightCone={c.lightCone} /> : <p className="text-ink-soft">沒有裝備光錐</p>}
              </Section>

              {c.eidolons.length > 0 && (
                <Section title="星魂" icon="star">
                  <EidolonGrid eidolons={c.eidolons} />
                </Section>
              )}
            </div>

            <Section title="遺器與位面飾品" icon="shield-check" className="@3xl:col-span-2" aside={c.relicGrade && <RelicGradeSummary grade={c.relicGrade} />}>
              {c.relics.length > 0 ? (
                <ul className="grid grid-cols-1 gap-4 @lg:grid-cols-2 @3xl:grid-cols-3">
                  {c.relics.map((relic, i) => (
                    <RelicCard key={relic.pos ?? `i${i}`} relic={relic} />
                  ))}
                </ul>
              ) : (
                <p className="text-ink-soft">沒有裝備遺器</p>
              )}
            </Section>

            {traces.length > 0 && (
              <Section title="行跡" icon="target" className="@3xl:col-span-2">
                <ul className="grid grid-cols-1 gap-1.5 @md:grid-cols-2 @3xl:grid-cols-3">
                  {traces.map((trace, i) => (
                    <TraceRow key={i} trace={trace} />
                  ))}
                </ul>
                {bonuses.length > 0 && (
                  <p className="text-ink-soft">
                    屬性加成已點亮{" "}
                    <span className="sr-num text-lg font-bold text-ink">
                      {bonuses.filter((b) => b.activated).length} / {bonuses.length}
                    </span>
                  </p>
                )}
              </Section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** 捲動時標題列留在上方 手機上是全螢幕 關閉鈕要一直按得到 */
function DetailHeader({ character: c, titleId, onClose }: { character: StarrailCharacter; titleId: string; onClose: () => void }) {
  const path = pathLabel(c.path);
  const rarity = stars(c.rarity);
  return (
    <header className="sticky top-0 z-10 order-1 flex items-start gap-3 border-b border-line bg-[var(--sr-detail-bar)] px-4 py-4 backdrop-blur sm:px-6 lg:order-none">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <h3 id={titleId} className="truncate text-2xl font-bold tracking-wide text-ink lg:text-3xl">
          {c.name ?? "（未知角色）"}
        </h3>
        <div className="flex flex-wrap items-center gap-1.5">
          {rarity && <GoldChip>{rarity}</GoldChip>}
          {c.element && (
            <span className="chip">
              <ElementBadge element={c.element} src={c.elementIcon} decorative className="size-4 text-[0.5625rem]" />
              {elementLabel(c.element)}
            </span>
          )}
          {path && (
            <span className="chip">
              <GameIcon src={c.pathIcon} className="size-4" />
              {path}
            </span>
          )}
          {c.level !== null && (
            <span className="chip">
              等級 <span className="sr-num text-sm font-bold">{c.level}</span>
            </span>
          )}
          {c.eidolon !== null && (
            <span className="chip">
              星魂 <span className="sr-num text-sm font-bold">{c.eidolon}</span>
            </span>
          )}
        </div>
      </div>
      <button type="button" onClick={onClose} className="btn-secondary btn-sm btn-icon" aria-label="關閉">
        <Icon name="x" className="size-4" />
      </button>
    </header>
  );
}

function StatsTable({ stats }: { stats: StatLine[] }) {
  return (
    <table className="w-full">
      <thead>
        <tr className="text-[0.9375rem] text-ink-soft">
          <th className="py-1 text-left font-medium">屬性</th>
          <th className="py-1 text-right font-medium">基礎</th>
          <th className="py-1 text-right font-medium">加成</th>
          <th className="py-1 text-right font-medium">最終</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {stats.map((stat, i) => (
          <tr key={`${stat.type}-${i}`}>
            <td className="py-1.5 text-ink-soft">
              <span className="flex items-center gap-1.5">
                <GameIcon src={stat.icon} className="size-5" />
                {stat.name}
              </span>
            </td>
            <td className="sr-num py-1.5 text-right text-[1.0625rem] text-ink-soft">{dash(stat.base)}</td>
            <td className="sr-num py-1.5 text-right text-[1.0625rem] text-[var(--sr-bonus)]">{dash(stat.add)}</td>
            <td className="sr-num py-1.5 text-right text-lg font-bold text-ink">{dash(stat.final)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function LightConeCard({ lightCone }: { lightCone: LightCone }) {
  const rarity = stars(lightCone.rarity);
  return (
    <div className="sr-panel flex items-center gap-3 p-4 [--sr-cut:10px]">
      <span className={`relative h-20 w-16 shrink-0 overflow-hidden ${rarityClass(lightCone.rarity)}`}>
        <ExternalImage src={lightCone.icon} alt={lightCone.name ?? ""} fill className="object-cover" fallback={<FallbackIcon name="sparkles" />} />
      </span>
      <div className="flex min-w-0 flex-col gap-1">
        <p className="line-clamp-2 text-lg leading-snug font-semibold text-ink">{dash(lightCone.name)}</p>
        <p className="flex flex-wrap items-baseline gap-x-4 text-ink-soft">
          <span className="sr-num text-lg font-bold text-ink">Lv.{dash(lightCone.level)}</span>
          <span>
            疊影 <span className="sr-num text-lg font-bold text-ink">{dash(lightCone.superimposition)}</span>
          </span>
        </p>
        {rarity && <p className="text-[var(--sr-gold-ink)]">{rarity}</p>}
      </div>
    </div>
  );
}

function EidolonGrid({ eidolons }: { eidolons: Eidolon[] }) {
  return (
    // 右欄分兩欄時這一區比較窄 六格放不下名字 改回一排三個
    <ul className="grid grid-cols-3 gap-3 @lg:grid-cols-6 @3xl:grid-cols-3">
      {eidolons.map((e, i) => (
        <li key={e.pos ?? i} className={`flex flex-col items-center gap-1.5 text-center ${e.unlocked === false ? "opacity-50" : ""}`}>
          <span className={`relative size-12 overflow-hidden rounded-full bg-[var(--sr-avatar-bg)] ring-1 ${e.unlocked === false ? "ring-line" : "ring-[var(--sr-gold-line)]"}`}>
            <ExternalImage src={e.icon} alt="" fill className="object-cover" fallback={<FallbackIcon name="star" />} />
            {e.unlocked === false && (
              <span className="absolute inset-0 grid place-items-center bg-black/40 text-white">
                <Icon name="lock" label="未解鎖" className="size-4" />
              </span>
            )}
          </span>
          <span className="line-clamp-2 text-sm leading-tight text-ink-soft">{dash(e.name)}</span>
        </li>
      ))}
    </ul>
  );
}

/** className 給排欄用 col-span 寫在區塊自己身上 */
type SectionProps = { title: string; icon: UiIconName; className?: string; aside?: ReactNode; children: ReactNode };

/** aside 放在標題右邊 例如遺器總評 */
function Section({ title, icon, className = "", aside, children }: SectionProps) {
  const heading = (
    <h4 className="sr-title">
      <Icon name={icon} className="size-4 text-sr-gold" />
      {title}
    </h4>
  );
  return (
    <section className={`stack min-w-0 ${className}`.trim()}>
      {aside ? (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          {heading}
          {aside}
        </div>
      ) : (
        heading
      )}
      {children}
    </section>
  );
}

/** 使用者選的等級字母 方法與權重照 hsr-optimizer */
function RelicGradeSummary({ grade }: { grade: RelicGrade }) {
  return (
    <p className="flex items-center gap-2 text-ink">
      <span className="font-medium">遺器總評</span>
      <span className="sr-num text-2xl leading-none font-bold text-[var(--sr-gold-ink)]">{grade}</span>
      <InfoTip label="遺器評分的說明">照 hsr-optimizer 的角色權重算，SS 最好，C 最差</InfoTip>
    </p>
  );
}

/** 主屬性角色用不到時 hsr-optimizer 也不給等級 */
function RelicGradeMark({ rating }: { rating: RelicRating | null | undefined }) {
  if (!rating) return null;
  if (rating.grade === null) return <span className="shrink-0 text-sm font-medium text-ink">主屬性不合</span>;
  return (
    <span className="sr-num shrink-0 text-2xl leading-none font-bold text-[var(--sr-gold-ink)]" title={`約理想的 ${Math.round(rating.percent)}%`}>
      <span aria-hidden>{rating.grade}</span>
      <span className="sr-only">評分 {rating.grade}</span>
    </span>
  );
}

function FallbackIcon({ name }: { name: UiIconName }) {
  return (
    <span className="absolute inset-0 grid place-items-center text-white/80">
      <Icon name={name} className="size-5" />
    </span>
  );
}

// 數值靠右且欄寬至少 3rem 主屬性與副詞條才對齊 強化次數也排成一直線
function StatText({ stat, main = false }: { stat: RelicStat; main?: boolean }) {
  const upgrades = main ? 0 : relicUpgrades(stat.times);
  return (
    <>
      {/* 有評分時每一條都留圓點的位置 圖示才對得齊 */}
      {stat.useful !== undefined && <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${stat.useful ? "bg-sr-gold" : ""}`} />}
      <GameIcon src={stat.icon} />
      <span className={`min-w-0 truncate ${main ? "font-semibold text-ink" : "text-ink-soft"}`}>
        {stat.name}
        {stat.useful && <span className="sr-only">，角色用得到</span>}
      </span>
      <span className="ml-auto flex shrink-0 items-center gap-1.5">
        {upgrades > 0 && <Upgrades count={upgrades} />}
        <span className={`sr-num min-w-12 text-right ${main ? "text-lg font-bold text-ink" : "text-[1.0625rem] text-ink"}`}>{dash(stat.value)}</span>
      </span>
    </>
  );
}

function RelicCard({ relic }: { relic: Relic }) {
  return (
    <li className="sr-panel flex flex-col gap-2 p-4 [--sr-cut:10px]">
      <div className="flex items-center gap-2.5">
        <span className={`relative size-12 shrink-0 overflow-hidden rounded-md ${rarityClass(relic.rarity)}`}>
          <ExternalImage src={relic.icon} alt={relic.name ?? ""} fill className="object-cover" fallback={<FallbackIcon name="shield-check" />} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium tracking-wide text-[var(--sr-gold-ink)]">{relicSlotLabel(relic.pos) ?? "遺器"}</p>
          <p className="line-clamp-2 leading-snug font-medium text-ink" title={relic.name ?? undefined}>
            {dash(relic.name)}
          </p>
        </div>
        {relic.level !== null && <span className="sr-num shrink-0 text-lg font-bold text-ink">+{relic.level}</span>}
        <RelicGradeMark rating={relic.rating} />
      </div>
      {relic.mainStat && (
        <p className="flex items-center gap-2 border-b border-line pb-1.5">
          <StatText stat={relic.mainStat} main />
        </p>
      )}
      {relic.subStats.length > 0 && (
        <ul className="flex flex-col gap-0.5 text-[0.9375rem]">
          {relic.subStats.map((stat, i) => (
            <li key={i} className="flex items-center gap-2">
              <StatText stat={stat} />
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * 副詞條的強化次數寫成 +N 照資料寫不設上限 推定或資料錯了才看得出來
 * 報讀器念強化幾次
 */
function Upgrades({ count }: { count: number }) {
  return (
    <span title={`強化 ${count} 次`} className="sr-num text-[0.9375rem] font-bold text-sr-gold">
      <span aria-hidden>+{count}</span>
      <span className="sr-only">強化 {count} 次</span>
    </span>
  );
}

function TraceRow({ trace }: { trace: Trace }) {
  return (
    <li className={`flex items-center gap-2.5 py-1 ${trace.activated === false ? "opacity-55" : ""}`}>
      <span className="relative size-9 shrink-0 overflow-hidden rounded-full bg-[var(--sr-avatar-bg)] ring-1 ring-line">
        <ExternalImage src={trace.icon} alt="" fill className="object-cover" fallback={<FallbackIcon name="target" />} />
      </span>
      <span className="flex min-w-0 flex-1 items-baseline gap-1.5 text-ink">
        {trace.typeLabel && <span className="shrink-0 text-[0.9375rem] text-[var(--sr-gold-ink)]">{trace.typeLabel}</span>}
        <span className="truncate">{dash(trace.name)}</span>
      </span>
      {trace.kind === "skill" && trace.level !== null && <span className="sr-num shrink-0 text-lg font-bold text-ink">Lv.{trace.level}</span>}
      {trace.kind === "major" && trace.activated === false && <span className="chip shrink-0">未解鎖</span>}
    </li>
  );
}
