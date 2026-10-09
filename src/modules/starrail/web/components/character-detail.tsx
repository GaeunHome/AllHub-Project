import type { ReactNode } from "react";
import { ExternalImage } from "@/core/ui/external-image";
import { Icon, type UiIconName } from "@/core/ui/icon";
import { elementLabel, pathLabel, relicSlotLabel, type Relic, type RelicStat, type StarrailCharacter, type Trace } from "../../lib/characters";
import { ElementBadge, Portrait, rarityClass } from "./sr-visuals";

const dash = (value: string | number | null) => (value === null || value === "" ? "—" : value);
const stars = (rarity: number | null) => (rarity ? "★".repeat(Math.min(rarity, 5)) : null);

/** 角色詳情：立繪、光錐、遺器、面板、星魂與行跡；讀不到的欄位顯示「—」 */
export function CharacterDetail({ character, titleId, onClose }: { character: StarrailCharacter; titleId: string; onClose: () => void }) {
  const c = character;
  const path = pathLabel(c.path);
  const traces = c.traces.filter((t) => t.kind !== "bonus");
  const bonuses = c.traces.filter((t) => t.kind === "bonus");
  return (
    <div className="flex flex-col">
      {/* 捲動時標題列留在上方：手機上是全螢幕，關閉鈕要一直按得到 */}
      <header className="sticky top-0 z-10 flex items-start gap-3 border-b border-line bg-[#0d1233]/95 px-5 py-4 backdrop-blur sm:px-6">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <h3 id={titleId} className="truncate text-xl font-bold tracking-wide text-ink">
            {c.name ?? "（未知角色）"}
          </h3>
          <div className="flex flex-wrap items-center gap-1.5">
            {stars(c.rarity) && <span className="chip border-[var(--sr-gold-line)] bg-[var(--sr-gold-soft)] text-[#f4d79b]">{stars(c.rarity)}</span>}
            {c.element && (
              <span className="chip">
                <ElementBadge element={c.element} className="size-4 text-[0.5625rem]" />
                {elementLabel(c.element)}
              </span>
            )}
            {path && <span className="chip">{path}</span>}
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

      <div className="grid gap-8 p-5 sm:p-6 md:grid-cols-[15rem_minmax(0,1fr)]">
        <aside className="page-stack">
          {/* 立繪；沒有立繪或讀不到時改放頭像，再不行就是屬性色底加名字 */}
          <div className={`relative mx-auto aspect-[3/4] w-full max-w-60 overflow-hidden [clip-path:polygon(0_0,calc(100%-18px)_0,100%_18px,100%_100%,18px_100%,0_calc(100%-18px))] ${rarityClass(c.rarity)}`}>
            {c.image ? (
              <ExternalImage src={c.image} alt={c.name ?? ""} fill className="object-cover object-top" fallback={<Portrait src={c.icon} name={c.name} element={c.element} />} />
            ) : (
              <Portrait src={c.icon} name={c.name} element={c.element} />
            )}
            <span className="absolute inset-x-0 bottom-0 h-1/4 bg-linear-to-t from-black/50 to-transparent" />
          </div>

          <Section title="光錐" icon="sparkles">
            {c.lightCone ? (
              <div className="sr-panel flex items-center gap-3 p-4 [--sr-cut:10px]">
                <span className={`relative h-20 w-16 shrink-0 overflow-hidden ${rarityClass(c.lightCone.rarity)}`}>
                  <ExternalImage src={c.lightCone.icon} alt={c.lightCone.name ?? ""} fill className="object-cover" fallback={<FallbackIcon name="sparkles" />} />
                </span>
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="line-clamp-2 leading-snug font-semibold text-ink">{dash(c.lightCone.name)}</p>
                  <p className="text-sm text-ink-soft">
                    <span className="sr-num text-base font-bold text-ink">Lv.{dash(c.lightCone.level)}</span> · 疊影{" "}
                    <span className="sr-num text-base font-bold text-ink">{dash(c.lightCone.superimposition)}</span>
                  </p>
                  {stars(c.lightCone.rarity) && <p className="text-sm text-[#f4d79b]">{stars(c.lightCone.rarity)}</p>}
                </div>
              </div>
            ) : (
              <p className="text-sm text-ink-soft">沒有裝備光錐</p>
            )}
          </Section>
        </aside>

        <div className="page-stack min-w-0">
          <Section title="面板" icon="chart-column">
            {c.stats.length > 0 ? (
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
                  {c.stats.map((stat, i) => (
                    <tr key={`${stat.type}-${i}`}>
                      <td className="py-1.5 text-ink-soft">{stat.name}</td>
                      <td className="sr-num py-1.5 text-right text-[0.9375rem] text-ink-soft">{dash(stat.base)}</td>
                      <td className="sr-num py-1.5 text-right text-[0.9375rem] text-[#8fe3bd]">{dash(stat.add)}</td>
                      <td className="sr-num py-1.5 text-right text-base font-bold text-ink">{dash(stat.final)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-ink-soft">沒有面板資料</p>
            )}
          </Section>

          <Section title="遺器與位面飾品" icon="shield-check">
            {c.relics.length > 0 ? (
              <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {c.relics.map((relic, i) => (
                  <RelicCard key={relic.pos ?? `i${i}`} relic={relic} />
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-soft">沒有裝備遺器</p>
            )}
          </Section>

          {c.eidolons.length > 0 && (
            <Section title="星魂" icon="star">
              <ul className="grid grid-cols-3 gap-3 sm:grid-cols-6">
                {c.eidolons.map((e, i) => (
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
            </Section>
          )}

          {traces.length > 0 && (
            <Section title="行跡" icon="target">
              <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
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
  );
}

function Section({ title, icon, children }: { title: string; icon: UiIconName; children: ReactNode }) {
  return (
    <section className="stack">
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

function StatText({ stat, main = false }: { stat: RelicStat; main?: boolean }) {
  return (
    <>
      <span className={main ? "font-semibold text-ink" : "text-ink-soft"}>{stat.name}</span>
      <span className={`sr-num ml-auto ${main ? "text-base font-bold text-ink" : "text-[0.9375rem] text-ink"}`}>{dash(stat.value)}</span>
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
              {/* HoYoLAB 回傳的 times；尚未用真實帳號確認是否包含初始那一次 */}
              <span title={stat.times !== null ? `強化 ${stat.times} 次` : undefined} className="sr-num w-6 shrink-0 text-right text-[0.9375rem] font-bold text-sr-gold">
                {stat.times !== null && stat.times > 0 ? `+${stat.times}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
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
