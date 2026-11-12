"use client";

import { useId, useState } from "react";
import { DRAG_SCROLL } from "@/core/ui/drag-scroll";
import { FormMessage } from "@/core/ui/form-message";
import { Icon } from "@/core/ui/icon";
import { SegmentedControl } from "@/core/ui/segmented-control";
import { groupDigits } from "@/core/number";
import { challengeLabel } from "../../lib/calendar";
import { ENDGAME_MODES, type Endgame, type EndgameFloor, type EndgameMode, type EndgameSchedule } from "../../lib/endgame";
import type { Peak } from "../../lib/peak";
import { PeakView, peakSeasonFor } from "./peak-view";
import { NoRecordNotice, QuickClear, RoundCount } from "./sr-visuals";
import { TeamAvatar } from "./team-avatar";

export type EndgameRecord = { mode: EndgameMode; schedule: EndgameSchedule } & ({ ok: true; endgame: Endgame } | { ok: false; message: string });

/** 異相仲裁一次讀最近三期 本期與上期都在裡面 */
export type PeakRecord = { ok: true; peak: Peak } | { ok: false; message: string };

/** 使用者要的 異相仲裁排在另外三種後面 */
type Tab = EndgameMode | "peak";
const TABS: readonly Tab[] = [...ENDGAME_MODES, "peak"];

const SCHEDULES: { id: EndgameSchedule; label: string }[] = [
  { id: "current", label: "本期" },
  { id: "previous", label: "上期" },
];

/** 三種模式的本期上期與異相仲裁已經一起查好 模式與期別的切換在瀏覽器裡做 */
export function EndgameView({ records, peak, names }: { records: EndgameRecord[]; peak: PeakRecord; names: Record<number, string | null> }) {
  const [mode, setMode] = useState<Tab>("chaos");
  const [schedule, setSchedule] = useState<EndgameSchedule>("current");
  const id = useId();
  const record = records.find((r) => r.mode === mode && r.schedule === schedule);

  return (
    <section aria-labelledby={`${id}-title`} className="stack">
      {/* 至少 44px 跟分段選擇一樣高 有沒有選項時標題都在同一個位置 */}
      <div className="flex min-h-11 flex-wrap items-center gap-x-4 gap-y-3">
        <h3 id={`${id}-title`} className="sr-title">
          終局戰績
        </h3>
        <div className="sm:ml-auto">
          <SegmentedControl label="期數" options={SCHEDULES} value={schedule} onChange={setSchedule} />
        </div>
      </div>
      <div {...DRAG_SCROLL} role="tablist" aria-label="模式" className="no-scrollbar flex overflow-x-auto border-b border-line">
        {TABS.map((m) => (
          <button key={m} type="button" role="tab" aria-selected={m === mode} onClick={() => setMode(m)} className="sr-tab shrink-0">
            {challengeLabel(m)}
          </button>
        ))}
      </div>
      {mode === "peak" ? (
        peak.ok ? (
          <PeakView season={peakSeasonFor(peak.peak, schedule)} names={names} />
        ) : (
          <FormMessage tone="error">{peak.message}</FormMessage>
        )
      ) : !record ? null : record.ok ? (
        <EndgameRecordView endgame={record.endgame} names={names} />
      ) : (
        <FormMessage tone="error">{record.message}</FormMessage>
      )}
    </section>
  );
}

function EndgameRecordView({ endgame, names }: { endgame: Endgame; names: Record<number, string | null> }) {
  if (!endgame.hasData) return <NoRecordNotice name={endgame.name} />;
  return (
    <div className="stack">
      {/* 手機上名稱與期間一列 數字排在下一列 寬螢幕數字排在右邊 */}
      <div className="sr-panel flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:gap-6 sm:p-6">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="truncate text-lg font-bold tracking-wide text-ink">{endgame.name ?? challengeLabel(endgame.mode)}</p>
          {(endgame.begin || endgame.end) && (
            <p className="flex items-center gap-1.5 text-sm text-ink-soft">
              <Icon name="calendar" className="size-3.5" />
              {endgame.begin ?? "?"} – {endgame.end ?? "?"}
            </p>
          )}
        </div>
        {/* 中間的最高關卡字比較長 那一欄撐開 另外兩欄照內容寬度 */}
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-4 sm:flex sm:gap-6">
          <Summary label="總星數" value={endgame.stars === null ? "—" : String(endgame.stars)} star />
          <Summary label="最高關卡" value={endgame.maxFloor ?? "—"} />
          <Summary label="挑戰次數" value={endgame.battles === null ? "—" : String(endgame.battles)} />
        </div>
      </div>
      {endgame.floors.length > 0 && (
        <ul className="stack">
          {endgame.floors.map((floor, i) => (
            <FloorRow key={`${floor.name}-${i}`} floor={floor} names={names} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Summary({ label, value, star = false }: { label: string; value: string; star?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className="text-sm text-ink-soft">{label}</span>
      <span className="sr-num flex items-center gap-1 text-2xl font-bold whitespace-nowrap text-ink">
        {star && <span className="text-sr-gold">★</span>}
        {value}
      </span>
    </div>
  );
}

/**
 * 使用者選的 兩隊就兩欄 星啟模式的三隊就三欄 放不下時少一欄
 * 欄數與角色卡大小看這一層卡片的寬度 在 starrail.css 的 sr-teams
 */
function FloorRow({ floor, names }: { floor: EndgameFloor; names: Record<number, string | null> }) {
  const earned = Math.min(floor.stars ?? 0, 3);
  return (
    <li className="sr-panel @container flex flex-col gap-4 p-4 [--sr-cut:12px] sm:p-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="text-lg font-semibold text-ink">{floor.name ?? "（未知關卡）"}</p>
        <span aria-label={`${floor.stars ?? 0} 顆星`} className="text-lg tracking-wider">
          <span className="text-sr-gold">{"★".repeat(earned)}</span>
          <span className="text-white/25">{"★".repeat(3 - earned)}</span>
        </span>
        {/* 使用者要的少用小標籤 跟異相仲裁一樣用圖示加文字 */}
        <span className="ml-auto flex items-center gap-4">
          {floor.quickClear && <QuickClear />}
          {floor.rounds !== null && <RoundCount rounds={floor.rounds} />}
          {floor.score !== null && (
            <span className="flex items-center gap-1.5 text-ink">
              <Icon name="target" className="size-4 text-sr-gold" />
              <span className="sr-num text-lg font-bold">{groupDigits(floor.score)}</span> 分
            </span>
          )}
        </span>
      </div>
      {floor.nodes.length > 0 && (
        <div data-teams={floor.nodes.length} className="sr-teams">
          {floor.nodes.map((node, i) => (
            <div key={i} className="flex min-w-0 flex-col gap-2">
              <div className="flex min-h-7 items-center gap-2.5">
                <span className="sr-team-number sr-num">
                  <span aria-hidden>{i + 1}</span>
                  <span className="sr-only">第 {i + 1} 隊</span>
                </span>
                {node.score !== null && <span className="sr-num text-base font-bold text-ink">{groupDigits(node.score)}</span>}
                {node.bossDefeated === false && <span className="chip chip-warning">未擊敗</span>}
              </div>
              <div className="flex gap-2">
                {node.avatars.map((member, j) => (
                  <TeamAvatar key={`${member.id}-${j}`} member={member} name={member.id === null ? null : (names[member.id] ?? null)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </li>
  );
}
