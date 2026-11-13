"use client";

import { useId, useState } from "react";
import { DRAG_SCROLL } from "@/core/ui/drag-scroll";
import { FormMessage } from "@/core/ui/form-message";
import { Icon } from "@/core/ui/icon";
import { SegmentedControl } from "@/core/ui/segmented-control";
import { groupDigits } from "@/core/number";
import { ExternalImage } from "@/core/ui/external-image";
import { challengeLabel } from "../../lib/calendar";
import { deepestFloor, ENDGAME_MODES, type Endgame, type EndgameFloor, type EndgameMode, type EndgameNode, type EndgameSchedule } from "../../lib/endgame";
import type { Peak } from "../../lib/peak";
import { BuffLine, Figure, Team, TeamNumber, type Names } from "./endgame-parts";
import { PeakView, peakSeasonFor } from "./peak-view";
import { BossResult, NoRecordNotice, QuickClear, RoundCount, ScoreCount, StarRow } from "./sr-visuals";

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
export function EndgameView({ records, peak, names }: { records: EndgameRecord[]; peak: PeakRecord; names: Names }) {
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

/**
 * 使用者選的 最深的一層照異相仲裁放大 每一隊一張卡
 * 其他層收在其他關卡裡 點了才展開 照原本一列一層
 */
export function EndgameRecordView({ endgame, names }: { endgame: Endgame; names: Names }) {
  if (!endgame.hasData) return <NoRecordNotice name={endgame.name} />;
  const deepest = deepestFloor(endgame);
  const others = endgame.floors.filter((floor) => floor !== deepest);
  return (
    <div className="stack @container">
      <EndgameSummary endgame={endgame} />
      {deepest && <DeepestFloor floor={deepest} mode={endgame.mode} names={names} />}
      {others.length > 0 && (
        <details className="disclosure">
          <summary>其他關卡（{others.length}）</summary>
          <ul className="stack">
            {others.map((floor, i) => (
              <FloorRow key={`${floor.name}-${i}`} floor={floor} names={names} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/** 跟異相仲裁的總覽一樣 名稱與期間在左 大數字在右 手機上數字換到下一列 */
function EndgameSummary({ endgame }: { endgame: Endgame }) {
  return (
    <div className="sr-panel flex flex-col gap-4 p-5 sm:p-6 @3xl:flex-row @3xl:items-center @3xl:gap-8">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="text-lg font-bold tracking-wide text-ink">{endgame.name ?? challengeLabel(endgame.mode)}</p>
        {(endgame.begin || endgame.end) && (
          <p className="flex items-center gap-1.5 text-sm text-ink">
            <Icon name="calendar" className="size-3.5 text-sr-gold" />
            {endgame.begin ?? "?"} – {endgame.end ?? "?"}
          </p>
        )}
      </div>
      <dl className="flex flex-wrap items-end gap-x-8 gap-y-4">
        <Figure label="總星數">
          <span className="text-sr-gold">★</span>
          {endgame.stars ?? "—"}
        </Figure>
        <Figure label="最深">{endgame.maxFloor ?? "—"}</Figure>
        <Figure label="挑戰">
          {endgame.battles ?? "—"}
          <span className="text-base font-semibold"> 次</span>
        </Figure>
      </dl>
    </div>
  );
}

/** 兩隊兩欄 星啟模式的三隊在夠寬時三欄 */
function DeepestFloor({ floor, mode, names }: { floor: EndgameFloor; mode: EndgameMode; names: Names }) {
  return (
    <section aria-label={`最深的一層：${floor.name ?? ""}`} className="stack">
      <div className="flex flex-wrap items-end gap-x-5 gap-y-2">
        <div className="min-w-0">
          <p className="sr-kicker">最深的一層</p>
          <h4 className="text-2xl font-bold text-ink">{floor.name ?? "（未知關卡）"}</h4>
        </div>
        <span className="flex flex-wrap items-center gap-x-5 gap-y-1.5 pb-1">
          <StarRow stars={floor.stars} label={floor.name ?? "這一層"} />
          {floor.rounds !== null && <RoundCount rounds={floor.rounds} />}
          {floor.quickClear && <QuickClear />}
          {floor.score !== null && <ScoreCount score={floor.score} />}
        </span>
      </div>
      {floor.nodes.length > 0 && (
        <ul className={floor.nodes.length > 2 ? "grid gap-4 @3xl:grid-cols-2 @6xl:grid-cols-3" : "grid gap-4 @3xl:grid-cols-2"}>
          {floor.nodes.map((node) => (
            <NodeCard key={node.slot} node={node} mode={mode} names={names} />
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * 末日幻影照王棋放首領大圖 虛構敘事放增益的圖示
 * 混沌回憶沒有圖 只有隊伍 角色卡跟著卡片的寬度放大
 */
function NodeCard({ node, mode, names }: { node: EndgameNode; mode: EndgameMode; names: Names }) {
  const { boss, buff } = node;
  return (
    <li className={boss?.icon ? "sr-panel sr-peak-boss sr-node" : "sr-panel sr-node"}>
      {boss?.icon && (
        <span aria-hidden className="sr-peak-boss-art">
          <ExternalImage src={boss.icon} alt="" fill className="object-contain object-right-bottom" />
        </span>
      )}
      <div className="sr-node-body">
        <div className="flex items-center gap-3">
          <TeamNumber slot={node.slot} />
          {boss?.name && <h5 className="min-w-0 text-xl font-bold text-ink">{boss.name}</h5>}
        </div>
        {buff && <BuffLine buff={buff} iconSize={mode === "fiction" ? "size-10" : "size-6"} />}
        {(node.score !== null || node.bossDefeated !== null) && (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
            {node.score !== null && <ScoreCount score={node.score} />}
            {node.bossDefeated !== null && <BossResult defeated={node.bossDefeated} />}
          </div>
        )}
        <div className="sr-node-team">
          <Team avatars={node.avatars} names={names} />
        </div>
      </div>
    </li>
  );
}

/**
 * 使用者選的 兩隊就兩欄 星啟模式的三隊就三欄 放不下時少一欄
 * 欄數與角色卡大小看這一層卡片的寬度 在 starrail.css 的 sr-teams
 */
function FloorRow({ floor, names }: { floor: EndgameFloor; names: Names }) {
  return (
    <li className="sr-panel @container flex flex-col gap-4 p-4 [--sr-cut:12px] sm:p-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="text-lg font-semibold text-ink">{floor.name ?? "（未知關卡）"}</p>
        <StarRow stars={floor.stars} label={floor.name ?? "這一層"} />
        {/* 使用者要的少用小標籤 跟異相仲裁一樣用圖示加文字 */}
        <span className="ml-auto flex items-center gap-4">
          {floor.quickClear && <QuickClear />}
          {floor.rounds !== null && <RoundCount rounds={floor.rounds} />}
          {floor.score !== null && <ScoreCount score={floor.score} />}
        </span>
      </div>
      {floor.nodes.length > 0 && (
        <div data-teams={floor.nodes.length} className="sr-teams">
          {floor.nodes.map((node) => (
            <div key={node.slot} className="flex min-w-0 flex-col gap-2">
              <div className="flex min-h-7 items-center gap-2.5">
                <TeamNumber slot={node.slot} />
                {node.score !== null && <span className="sr-num text-base font-bold text-ink">{groupDigits(node.score)}</span>}
                {node.bossDefeated === false && <BossResult defeated={false} />}
              </div>
              <Team avatars={node.avatars} names={names} />
            </div>
          ))}
        </div>
      )}
    </li>
  );
}
