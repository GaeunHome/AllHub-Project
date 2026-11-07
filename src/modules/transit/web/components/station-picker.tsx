"use client";

import { useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { Dialog, useDialog } from "@/core/ui/dialog";
import { EmptyState } from "@/core/ui/empty-state";
import { Icon } from "@/core/ui/icon";
import { metroMap } from "../../lib/metro-map";
import type { StationGroup } from "../../lib/station-groups";
import { plainName } from "../../lib/station-search";
import type { Station } from "../../lib/timetable";
import { mapSections, pickerSections, soleStation } from "../station-sections";
import { StationMap } from "./station-map";

/** map 是捷運 使用者選的整張路網圖 台鐵照舊是分組清單 */
type PickerData = { stations: Station[]; groups: StationGroup[]; frequent: Station[]; map?: boolean };
type PickerChoice = { value: string; except?: Station | null; onPick: (stationId: string) => void };
type StationLine = { name: string; color: string };

const dotStyle = (color: string) => ({ "--trn-line": color }) as CSSProperties;

/** 帶顏色的分組才是路線 台鐵的縣市沒有 三個系統的路線都在這裡 不用看車站代碼 */
function stationLines(groups: StationGroup[]): Map<string, StationLine> {
  return new Map(groups.flatMap(({ name, color, stations }) => (color ? stations.map((station) => [station.id, { name, color }] as const) : [])));
}

/** 常用與完整清單不分路線 同名的轉乘站要看得出是哪一條線 */
function StationButton({ station, line, selected, onPick }: { station: Station; line: StationLine | undefined; selected: boolean; onPick: (stationId: string) => void }) {
  return (
    <button type="button" onClick={() => onPick(station.id)} aria-current={selected ? "true" : undefined} className="trn-station">
      {line && <span aria-hidden="true" className="trn-dot" style={dotStyle(line.color)} />}
      {station.name}
      {line && <span className="sr-only">（{line.name}）</span>}
    </button>
  );
}

function StationSection({ section, lines, value, onPick }: { section: StationGroup; lines: Map<string, StationLine> } & Omit<PickerChoice, "except">) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className="trn-picker-group">
      <h3 id={titleId} className="trn-picker-title">
        {section.color && <span aria-hidden="true" className="trn-dot" style={dotStyle(section.color)} />}
        {section.name}
      </h3>
      <ul className="trn-picker-list">
        {section.stations.map((station) => (
          <li key={station.id}>
            <StationButton station={station} line={section.color ? undefined : lines.get(station.id)} selected={station.id === value} onPick={onPick} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** 只在視窗開著時掛上 所以每次打開都是空的搜尋框 全部在瀏覽器裡篩 不問伺服器 */
export function StationPanel({ stations, groups, frequent, map = false, value, except = null, onPick }: PickerData & PickerChoice) {
  const [query, setQuery] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const sections = pickerSections(stations, groups, frequent, query, except);
  const lines = stationLines(groups);
  const searching = plainName(query) !== "";
  const found = sections.reduce((total, section) => total + section.stations.length, 0);
  const drawn = useMemo(() => (map ? metroMap(stations) : null), [map, stations]);
  // 打字時照舊列出對得上的站 圖上一站都畫不出來時也退回清單
  const shownMap = !searching && drawn !== null && drawn.stations.length > 0 ? drawn : null;
  const around = shownMap && mapSections(groups, frequent, shownMap.missing, except);

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    // 視窗在查詢表單裡面 不擋的話 Enter 會送出表單
    event.preventDefault();
    if (!searching) return;
    const only = soleStation(sections);
    if (only) onPick(only.id);
    else listRef.current?.querySelector("button")?.focus();
  };

  return (
    <>
      <div className={shownMap ? "trn-picker-search trn-map-search" : "trn-picker-search"}>
        {/* 組字中的注音不算 不然每打一個音清單就空掉一次 */}
        <input
          type="text"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          aria-label="搜尋車站"
          placeholder="搜尋車站"
          data-autofocus
          className="input"
          onChange={(event) => {
            if (!(event.nativeEvent as InputEvent).isComposing) setQuery(event.target.value);
          }}
          onCompositionEnd={(event) => setQuery(event.currentTarget.value)}
          onKeyDown={onKeyDown}
        />
      </div>
      <p role="status" className="sr-only">
        {searching ? (found > 0 ? `找到 ${found} 個車站` : "找不到車站") : ""}
      </p>
      {shownMap && around ? (
        <div className="trn-map-panel">
          {around.frequent.map((section) => (
            <StationSection key={section.id} section={section} lines={lines} value={value} onPick={onPick} />
          ))}
          <StationMap map={shownMap} value={value} except={except} onPick={onPick} />
          {around.others.map((section) => (
            <StationSection key={section.id} section={section} lines={lines} value={value} onPick={onPick} />
          ))}
        </div>
      ) : (
        <div ref={listRef} className="stack">
          {sections.length === 0 && (searching ? <EmptyState compact icon="search" title="找不到這個車站" hint="換個寫法試試" /> : <EmptyState compact icon="circle-alert" title="車站資料暫時無法讀取" />)}
          {sections.map((section) => (
            <StationSection key={section.id} section={section} lines={lines} value={value} onPick={onPick} />
          ))}
        </div>
      )}
    </>
  );
}

type StationPickerProps = PickerData & { label: string; value: string; except: Station | null; onChange: (stationId: string) => void };

/** 台鐵與捷運站太多 長長的下拉很難用 高鐵的站少 照舊是下拉 */
export function StationPicker({ label, value, except, onChange, ...data }: StationPickerProps) {
  const dialog = useDialog();
  const chosen = data.stations.find((station) => station.id === value) ?? data.frequent.find((station) => station.id === value);
  const shown = chosen?.name ?? "請選擇";
  const pick = (stationId: string) => {
    dialog.close();
    onChange(stationId);
  };

  return (
    <div className="field min-w-0 flex-1">
      <span aria-hidden="true" className="field-label">
        {label}
      </span>
      <button {...dialog.triggerProps} aria-label={`${label}：${shown}`} className="input trn-picker-button">
        <span className="truncate">{shown}</span>
        <Icon name="chevron-down" className="size-4 shrink-0" />
      </button>
      {/* 路線圖要大 手機上是整個螢幕 */}
      <Dialog {...dialog.dialogProps} title={`選擇${label}`} size={data.map ? "full" : "lg"} className={data.map ? undefined : "trn-picker"}>
        <StationPanel {...data} value={value} except={except} onPick={pick} />
      </Dialog>
    </div>
  );
}
