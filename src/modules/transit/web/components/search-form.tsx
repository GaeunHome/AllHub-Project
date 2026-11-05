"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Icon } from "@/core/ui/icon";
import { SegmentedControl } from "@/core/ui/segmented-control";
import { BUS_CITIES, isBusCity } from "../../lib/bus";
import { METRO_SYSTEMS, isMetroSystem, type MetroSystem, type Mode } from "../../lib/modes";
import type { StationGroup } from "../../lib/station-groups";
import type { Station } from "../../lib/timetable";
import { searchHref, type SearchQuery } from "../search-query";
import { ModeTabs } from "./mode-tabs";
import { StationPicker } from "./station-picker";

const METRO_OPTIONS = (Object.keys(METRO_SYSTEMS) as MetroSystem[]).map((id) => ({ id, label: METRO_SYSTEMS[id] }));

type SearchFormProps = { query: SearchQuery; stations: Station[]; groups: StationGroup[]; frequent: Station[]; directions: Station[]; today: string; maxDate: string };

function StationSelect({ name, label, value, options, onChange, prefix = "" }: { name: string; label: string; value: string; options: Station[]; onChange: (value: string) => void; prefix?: string }) {
  return (
    <label className="field min-w-0 flex-1">
      <span className="field-label">{label}</span>
      <select name={name} value={value} onChange={(event) => onChange(event.target.value)} className="input">
        <option value="">請選擇</option>
        {options.map((station) => (
          <option key={station.id} value={station.id}>
            {prefix}
            {station.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function SwapButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label="交換起站與迄站" title="交換起站與迄站" className="btn-secondary btn-icon trn-swap">
      <Icon name="arrow-left-right" className="size-4" />
    </button>
  );
}

/** 捷運換站要重讀方向 所以馬上換網址 高鐵與台鐵按查詢才問 TDX */
export function SearchForm({ query, stations, groups, frequent, directions, today, maxDate }: SearchFormProps) {
  const router = useRouter();
  const [from, setFrom] = useState(query.from);
  const [to, setTo] = useState(query.to);
  const [date, setDate] = useState(query.date);
  const [time, setTime] = useState(query.time);
  const [line, setLine] = useState(query.line);
  const metro = query.mode === "metro";
  const bus = query.mode === "bus";
  const tra = query.mode === "tra";
  const picker = { stations, groups, frequent, metroSystem: metro ? query.system : null };
  const go = (next: Partial<SearchQuery>) => router.replace(searchHref({ ...query, from, to, date, time, line: line.trim(), direction: 0, ...next }), { scroll: false });
  const switchMode = (mode: Mode) => {
    setFrom("");
    setTo("");
    setLine("");
    setTime("");
    go({ mode, system: mode === "bus" ? "Taipei" : "TRTC", line: "", from: "", to: "", time: "" });
  };
  const chooseFrom = (value: string) => {
    setFrom(value);
    if (metro) {
      setTo("");
      go({ from: value, to: "" });
    }
  };
  // 使用者要的 只對調兩站 按查詢才問 TDX
  const swap = () => {
    setFrom(to);
    setTo(from);
  };
  const filled = from !== "" || to !== "" || line !== "" || time !== "" || date !== today;
  // 使用者要的 表單與查詢結果一起清掉 交通工具與捷運系統留著
  const clear = () => {
    setFrom("");
    setTo("");
    setLine("");
    setTime("");
    setDate(today);
    go({ from: "", to: "", line: "", time: "", date: today });
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    go({});
  };

  return (
    <form id="transit-search" onSubmit={submit} className="card p-0 overflow-hidden">
      <ModeTabs value={query.mode} onChange={switchMode} />
      <div className="trn-search-fields">
        {metro && (
          <div className="field min-w-0 flex-1">
            <span aria-hidden="true" className="field-label">
              捷運系統
            </span>
            <SegmentedControl
              variant="field"
              label="捷運系統"
              options={METRO_OPTIONS}
              value={isMetroSystem(query.system) ? query.system : "TRTC"}
              onChange={(system) => {
                setFrom("");
                setTo("");
                go({ system, from: "", to: "" });
              }}
            />
          </div>
        )}
        {bus && (
          <>
            <label className="field min-w-0 flex-1">
              <span className="field-label">縣市</span>
              <select value={query.system} onChange={(event) => isBusCity(event.target.value) && go({ system: event.target.value, line: "" })} className="input">
                {Object.entries(BUS_CITIES).map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field min-w-0 flex-1">
              <span className="field-label">路線</span>
              <input value={line} onChange={(event) => setLine(event.target.value)} placeholder="例如 307、紅30" autoComplete="off" className="input" />
            </label>
          </>
        )}
        {(tra || metro) && <StationPicker label="起站" value={from} onChange={chooseFrom} {...picker} />}
        {tra && <SwapButton onClick={swap} />}
        {tra && <StationPicker label="迄站" value={to} onChange={setTo} {...picker} />}
        {metro && <StationSelect name="to" label="方向" value={to} options={directions} prefix="往" onChange={setTo} />}
        {query.mode === "thsr" && (
          <>
            <StationSelect name="from" label="起站" value={from} options={stations} onChange={chooseFrom} />
            <SwapButton onClick={swap} />
            <StationSelect name="to" label="迄站" value={to} options={stations} onChange={setTo} />
          </>
        )}
        {!metro && !bus && (
          <label className="field min-w-0">
            <span className="field-label">日期</span>
            <input type="date" value={date} min={today} max={maxDate} onChange={(event) => setDate(event.target.value)} className="input" />
          </label>
        )}
        {!metro && !bus && (
          <label className="field min-w-0">
            <span className="field-label">出發時間</span>
            <input type="time" value={time} onChange={(event) => setTime(event.target.value)} className="input" />
          </label>
        )}
        <button className="btn-primary shrink-0">
          <Icon name="search" className="size-4" />
          查詢
        </button>
        {filled && (
          <button type="button" onClick={clear} className="btn-secondary shrink-0">
            清除
          </button>
        )}
      </div>
    </form>
  );
}
