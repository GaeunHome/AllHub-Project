"use client";

import { useId, useState } from "react";
import { FormMessage } from "@/core/ui/form-message";
import { Icon } from "@/core/ui/icon";
import { SegmentedControl } from "@/core/ui/segmented-control";
import { ENDGAME_MODES, endgameLabel, type Endgame, type EndgameFloor, type EndgameMode, type EndgameSchedule } from "../../lib/endgame";
import { groupDigits } from "../../lib/ledger";
import { TeamAvatar } from "./team-avatar";

export type EndgameRecord = { mode: EndgameMode; schedule: EndgameSchedule } & ({ ok: true; endgame: Endgame } | { ok: false; message: string });

const SCHEDULES: { id: EndgameSchedule; label: string }[] = [
  { id: "current", label: "本期" },
  { id: "previous", label: "上期" },
];

/** 模式與本期／上期的切換在瀏覽器裡做：六份資料已經一起查好 */
export function EndgameView({ records, names }: { records: EndgameRecord[]; names: Record<number, string | null> }) {
  const [mode, setMode] = useState<EndgameMode>("chaos");
  const [schedule, setSchedule] = useState<EndgameSchedule>("current");
  const id = useId();
  const record = records.find((r) => r.mode === mode && r.schedule === schedule);

  return (
    <section aria-labelledby={`${id}-title`} className="stack">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <h3 id={`${id}-title`} className="sr-title">
          終局戰績
        </h3>
        <div className="sm:ml-auto">
          <SegmentedControl label="期數" options={SCHEDULES} value={schedule} onChange={setSchedule} />
        </div>
      </div>
      <div role="tablist" aria-label="模式" className="no-scrollbar flex overflow-x-auto border-b border-line">
        {ENDGAME_MODES.map((m) => (
          <button key={m} type="button" role="tab" aria-selected={m === mode} onClick={() => setMode(m)} className="sr-tab shrink-0">
            {endgameLabel(m)}
          </button>
        ))}
      </div>
      {!record ? null : record.ok ? <EndgameRecordView endgame={record.endgame} names={names} /> : <FormMessage tone="error">{record.message}</FormMessage>}
    </section>
  );
}

function EndgameRecordView({ endgame, names }: { endgame: Endgame; names: Record<number, string | null> }) {
  if (!endgame.hasData) {
    return (
      <p className="sr-panel flex items-center gap-3 p-5 text-ink-soft sm:p-6">
        <Icon name="info" className="size-4 text-sr-gold" />
        這一期還沒有挑戰紀錄
        {endgame.name && <span className="text-ink">（{endgame.name}）</span>}
      </p>
    );
  }
  return (
    <div className="stack">
      {/* 手機上名稱與期間一列、三個數字排在下一列；寬螢幕數字排在右邊 */}
      <div className="sr-panel flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:gap-6 sm:p-6">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="truncate text-lg font-bold tracking-wide text-ink">{endgame.name ?? endgameLabel(endgame.mode)}</p>
          {(endgame.begin || endgame.end) && (
            <p className="flex items-center gap-1.5 text-sm text-ink-soft">
              <Icon name="calendar" className="size-3.5" />
              {endgame.begin ?? "?"} – {endgame.end ?? "?"}
            </p>
          )}
        </div>
        {/* 中間的「最高關卡」字比較長，那一欄撐開，另外兩欄照內容的寬度 */}
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

function FloorRow({ floor, names }: { floor: EndgameFloor; names: Record<number, string | null> }) {
  const earned = Math.min(floor.stars ?? 0, 3);
  return (
    <li className="sr-panel flex flex-col gap-3 p-4 [--sr-cut:12px]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="font-semibold text-ink">{floor.name ?? "（未知關卡）"}</p>
        <span aria-label={`${floor.stars ?? 0} 顆星`} className="text-base tracking-wider">
          <span className="text-sr-gold">{"★".repeat(earned)}</span>
          <span className="text-white/25">{"★".repeat(3 - earned)}</span>
        </span>
        <span className="ml-auto flex items-center gap-2">
          {floor.quickClear && <span className="chip">快速通關</span>}
          {floor.rounds !== null && (
            <span className="chip">
              <span className="sr-num text-[0.875rem] font-bold">{floor.rounds}</span> 回合
            </span>
          )}
          {floor.score !== null && (
            <span className="chip">
              <span className="sr-num text-[0.875rem] font-bold">{groupDigits(floor.score)}</span> 分
            </span>
          )}
        </span>
      </div>
      {floor.nodes.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {floor.nodes.map((node, i) => (
            <div key={i} className="flex items-center gap-2.5">
              <span className="w-10 shrink-0 text-sm font-medium text-[#f4d79b]">{i === 0 ? "上半" : i === 1 ? "下半" : `隊伍 ${i + 1}`}</span>
              <div className="flex flex-wrap gap-1.5">
                {node.avatars.map((member, j) => (
                  <TeamAvatar key={`${member.id}-${j}`} member={member} name={member.id === null ? null : (names[member.id] ?? null)} />
                ))}
              </div>
              {node.score !== null && <span className="sr-num ml-auto text-base font-bold text-ink">{groupDigits(node.score)}</span>}
              {node.bossDefeated === false && <span className="chip chip-warning">未擊敗</span>}
            </div>
          ))}
        </div>
      )}
    </li>
  );
}
