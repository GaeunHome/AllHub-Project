import type { ReactNode } from "react";
import { ExternalImage } from "@/core/ui/external-image";
import { Icon, type UiIconName } from "@/core/ui/icon";
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
import { ElementBadge, GameIcon, Portrait, rarityClass } from "./sr-visuals";

const dash = (value: string | number | null) => (value === null || value === "" ? "—" : value);
const stars = (rarity: number | null) => (rarity ? "★".repeat(Math.min(rarity, 5)) : null);

/**
 * 滿版的角色詳情 寬螢幕立繪是左邊一整欄 依面板高度放大
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
              {c.stats.length > 0 ? <StatsTable stats={c.stats} /> : <p className="text-sm text-ink-soft">沒有面板資料</p>}
            </Section>

            <div className="page-stack min-w-0">
              <Section title="光錐" icon="sparkles">
                {c.lightCone ? <LightConeCard lightCone={c.lightCone} /> : <p className="text-sm text-ink-soft">沒有裝備光錐</p>}
              </Section>

              {c.eidolons.length > 0 && (
                <Section title="星魂" icon="star">
                  <EidolonGrid eidolons={c.eidolons} />
                </Section>
              )}
            </div>

            <Section title="遺器與位面飾品" icon="shield-check" className="@3xl:col-span-2">
              {c.relics.length > 0 ? (
                <ul className="grid grid-cols-1 gap-4 @lg:grid-cols-2 @3xl:grid-cols-3">
                  {c.relics.map((relic, i) => (
                    <RelicCard key={relic.pos ?? `i${i}`} relic={relic} />
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-ink-soft">沒有裝備遺器</p>
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
                  <p className="text-sm text-ink-soft">
                    屬性加成已點亮{" "}
                    <span className="sr-num text-base font-bold text-ink">
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

/**
 * 立繪接近方形而且人物置中 完整放進去不裁切 寬螢幕依面板高度放大
 * 讀不到時改放頭像 再不行是屬性色底加名字
 */
function CharacterStage({ character: c }: { character: StarrailCharacter }) {
  return (
    <div className="sr-stage relative order-2 aspect-square max-h-[65dvh] w-full shrink-0 overflow-hidden lg:sticky lg:top-0 lg:order-none lg:aspect-auto lg:h-[100cqh] lg:max-h-none lg:w-[min(50cqw,100cqh)]" data-rarity={c.rarity ?? undefined}>
      {/* fill 要父層是 relative 或 absolute 寬螢幕的舞台是 sticky 所以再包一層 */}
      <div className="absolute inset-0">
        {c.image ? (
          <ExternalImage src={c.image} alt={c.name ?? ""} fill className="object-contain object-center" fallback={<Portrait src={c.icon} name={c.name} element={c.element} />} />
        ) : (
          <Portrait src={c.icon} name={c.name} element={c.element} />
        )}
        <span className="absolute inset-x-0 bottom-0 h-1/5 bg-linear-to-t from-black/45 to-transparent" />
      </div>
    </div>
  );
}

/** 捲動時標題列留在上方 手機上是全螢幕 關閉鈕要一直按得到 */
function DetailHeader({ character: c, titleId, onClose }: { character: StarrailCharacter; titleId: string; onClose: () => void }) {
  const path = pathLabel(c.path);
  const rarity = stars(c.rarity);
  return (
    <header className="sticky top-0 z-10 order-1 flex items-start gap-3 border-b border-line bg-[#0d1233]/95 px-4 py-4 backdrop-blur sm:px-6 lg:order-none">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <h3 id={titleId} className="truncate text-xl font-bold tracking-wide text-ink lg:text-2xl">
          {c.name ?? "（未知角色）"}
        </h3>
        <div className="flex flex-wrap items-center gap-1.5">
          {rarity && <span className="chip border-[var(--sr-gold-line)] bg-[var(--sr-gold-soft)] text-[#f4d79b]">{rarity}</span>}
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
              等級 <span className="sr-num text-[0.8125rem] font-bold">{c.level}</span>
            </span>
          )}
          {c.eidolon !== null && (
            <span className="chip">
              星魂 <span className="sr-num text-[0.8125rem] font-bold">{c.eidolon}</span>
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
    <table className="w-full text-sm">
      <thead>
        <tr className="text-[0.8125rem] text-ink-soft">
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
                <GameIcon src={stat.icon} />
                {stat.name}
              </span>
            </td>
            <td className="sr-num py-1.5 text-right text-[0.9375rem] text-ink-soft">{dash(stat.base)}</td>
            <td className="sr-num py-1.5 text-right text-[0.9375rem] text-[#8fe3bd]">{dash(stat.add)}</td>
            <td className="sr-num py-1.5 text-right text-base font-bold text-ink">{dash(stat.final)}</td>
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
        <p className="line-clamp-2 leading-snug font-semibold text-ink">{dash(lightCone.name)}</p>
        <p className="text-sm text-ink-soft">
          <span className="sr-num text-base font-bold text-ink">Lv.{dash(lightCone.level)}</span> · 疊影{" "}
          <span className="sr-num text-base font-bold text-ink">{dash(lightCone.superimposition)}</span>
        </p>
        {rarity && <p className="text-sm text-[#f4d79b]">{rarity}</p>}
      </div>
    </div>
  );
}

function EidolonGrid({ eidolons }: { eidolons: Eidolon[] }) {
  return (
    <ul className="grid grid-cols-3 gap-3 @sm:grid-cols-6">
      {eidolons.map((e, i) => (
        <li key={e.pos ?? i} className={`flex flex-col items-center gap-1.5 text-center ${e.unlocked === false ? "opacity-50" : ""}`}>
          <span className={`relative size-12 overflow-hidden rounded-full bg-[#1f2547] ring-1 ${e.unlocked === false ? "ring-line" : "ring-[var(--sr-gold-line)]"}`}>
            <ExternalImage src={e.icon} alt="" fill className="object-cover" fallback={<FallbackIcon name="star" />} />
            {e.unlocked === false && (
              <span className="absolute inset-0 grid place-items-center bg-black/40 text-white">
                <Icon name="lock" label="未解鎖" className="size-4" />
              </span>
            )}
          </span>
          <span className="line-clamp-2 text-xs leading-tight text-ink-soft">{dash(e.name)}</span>
        </li>
      ))}
    </ul>
  );
}

/** className 給排欄用 col-span 寫在區塊自己身上 */
function Section({ title, icon, className = "", children }: { title: string; icon: UiIconName; className?: string; children: ReactNode }) {
  return (
    <section className={`stack min-w-0 ${className}`.trim()}>
      <h4 className="sr-title text-sm">
        <Icon name={icon} className="size-4 text-sr-gold" />
        {title}
      </h4>
      {children}
    </section>
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
      <GameIcon src={stat.icon} />
      <span className={`min-w-0 truncate ${main ? "font-semibold text-ink" : "text-ink-soft"}`}>{stat.name}</span>
      <span className="ml-auto flex shrink-0 items-center gap-1.5">
        {upgrades > 0 && <Upgrades count={upgrades} />}
        <span className={`sr-num min-w-12 text-right ${main ? "text-base font-bold text-ink" : "text-[0.9375rem] text-ink"}`}>{dash(stat.value)}</span>
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
          <p className="text-xs font-medium tracking-wide text-[#f4d79b]">{relicSlotLabel(relic.pos) ?? "遺器"}</p>
          <p className="line-clamp-2 text-sm leading-snug font-medium text-ink" title={relic.name ?? undefined}>
            {dash(relic.name)}
          </p>
        </div>
        {relic.level !== null && <span className="sr-num shrink-0 text-base font-bold text-ink">+{relic.level}</span>}
      </div>
      {relic.mainStat && (
        <p className="flex items-center gap-2 border-b border-line pb-1.5 text-sm">
          <StatText stat={relic.mainStat} main />
        </p>
      )}
      {relic.subStats.length > 0 && (
        <ul className="flex flex-col gap-0.5 text-[0.8125rem]">
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
    <span title={`強化 ${count} 次`} className="sr-num text-[0.8125rem] font-bold text-sr-gold">
      <span aria-hidden>+{count}</span>
      <span className="sr-only">強化 {count} 次</span>
    </span>
  );
}

function TraceRow({ trace }: { trace: Trace }) {
  return (
    <li className={`flex items-center gap-2.5 py-1 ${trace.activated === false ? "opacity-55" : ""}`}>
      <span className="relative size-9 shrink-0 overflow-hidden rounded-full bg-[#1f2547] ring-1 ring-line">
        <ExternalImage src={trace.icon} alt="" fill className="object-cover" fallback={<FallbackIcon name="target" />} />
      </span>
      <span className="flex min-w-0 flex-1 items-baseline gap-1.5 text-sm text-ink">
        {trace.typeLabel && <span className="shrink-0 text-[0.8125rem] text-[#f4d79b]">{trace.typeLabel}</span>}
        <span className="truncate">{dash(trace.name)}</span>
      </span>
      {trace.kind === "skill" && trace.level !== null && <span className="sr-num shrink-0 text-base font-bold text-ink">Lv.{trace.level}</span>}
      {trace.kind === "major" && trace.activated === false && <span className="chip shrink-0">未解鎖</span>}
    </li>
  );
}
