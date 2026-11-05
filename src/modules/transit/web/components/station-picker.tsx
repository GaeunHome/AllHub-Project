"use client";

import { useId, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { Dialog, useDialog } from "@/core/ui/dialog";
import { EmptyState } from "@/core/ui/empty-state";
import { Icon } from "@/core/ui/icon";
import { metroLine } from "../../lib/lines";
import type { StationGroup } from "../../lib/station-groups";
import { plainName } from "../../lib/station-search";
import type { Station } from "../../lib/timetable";
import { pickerSections, soleStation } from "../station-sections";

/** metroSystem 只有捷運有 台鐵是 null */
type PickerData = { stations: Station[]; groups: StationGroup[]; frequent: Station[]; metroSystem: string | null };
type PickerChoice = { value: string; onPick: (stationId: string) => void };

const dotStyle = (color: string) => ({ "--trn-line": color }) as CSSProperties;

/** 常用與完整清單不分路線 同名的轉乘站要看得出是哪一條線 */
function StationButton({ station, line, selected, onPick }: { station: Station; line: ReturnType<typeof metroLine> | null; selected: boolean; onPick: (stationId: string) => void }) {
  return (
    <button type="button" onClick={() => onPick(station.id)} aria-current={selected ? "true" : undefined} className="trn-station">
      {line && <span aria-hidden="true" className="trn-dot" style={dotStyle(line.color)} />}
      {station.name}
      {line?.name && <span className="sr-only">（{line.name}）</span>}
    </button>
  );
}

function StationSection({ section, metroSystem, value, onPick }: { section: StationGroup; metroSystem: string | null } & PickerChoice) {
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
            <StationButton station={station} line={metroSystem && !section.color ? metroLine(metroSystem, station.id) : null} selected={station.id === value} onPick={onPick} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** 只在視窗開著時掛上 所以每次打開都是空的搜尋框 全部在瀏覽器裡篩 不問伺服器 */
export function StationPanel({ stations, groups, frequent, metroSystem, value, onPick }: PickerData & PickerChoice) {
  const [query, setQuery] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const sections = pickerSections(stations, groups, frequent, query);
  const searching = plainName(query) !== "";
  const found = sections.reduce((total, section) => total + section.stations.length, 0);

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
      <div className="trn-picker-search">
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
      <div ref={listRef} className="stack">
        {sections.length === 0 && (searching ? <EmptyState compact icon="search" title="找不到這個車站" hint="換個寫法試試" /> : <EmptyState compact icon="circle-alert" title="車站資料暫時讀不到，稍後再試" />)}
        {sections.map((section) => (
          <StationSection key={section.id} section={section} metroSystem={metroSystem} value={value} onPick={onPick} />
        ))}
      </div>
    </>
  );
}

type StationPickerProps = PickerData & { label: string; value: string; onChange: (stationId: string) => void };

/** 台鐵與捷運站太多 長長的下拉很難用 高鐵與捷運的方向選項少 照舊是下拉 */
export function StationPicker({ label, value, onChange, ...data }: StationPickerProps) {
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
      <Dialog {...dialog.dialogProps} title={`選擇${label}`} size="lg" className="trn-picker">
        <StationPanel {...data} value={value} onPick={pick} />
      </Dialog>
    </div>
  );
}
