"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Icon } from "@/core/ui/icon";
import { SegmentedControl } from "@/core/ui/segmented-control";
import { BUS_CITIES, isBusCity } from "../../lib/bus";
import { METRO_SYSTEMS, MODES, MODE_LABELS, isMetroSystem, type Mode } from "../../lib/modes";
import type { Station } from "../../lib/timetable";
import { searchHref, type SearchQuery } from "../search-query";

const MODE_OPTIONS = MODES.map((id) => ({ id, label: MODE_LABELS[id] }));

type SearchFormProps = { query: SearchQuery; stations: Station[]; directions: Station[]; today: string; maxDate: string };

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

/** 捷運換站要重讀方向 所以馬上換網址 高鐵與台鐵按查詢才問 TDX */
export function SearchForm({ query, stations, directions, today, maxDate }: SearchFormProps) {
  const router = useRouter();
  const [from, setFrom] = useState(query.from);
  const [to, setTo] = useState(query.to);
  const [date, setDate] = useState(query.date);
  const [line, setLine] = useState(query.line);
  const metro = query.mode === "metro";
  const bus = query.mode === "bus";
  const go = (next: Partial<SearchQuery>) => router.replace(searchHref({ ...query, from, to, date, line: line.trim(), direction: 0, ...next }), { scroll: false });
  const switchMode = (mode: Mode) => {
    setFrom("");
    setTo("");
    setLine("");
    go({ mode, system: mode === "bus" ? "Taipei" : "TRTC", line: "", from: "", to: "" });
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    go({});
  };

  return (
    <form id="transit-search" onSubmit={submit} className="card stack">
      <SegmentedControl label="交通工具" options={MODE_OPTIONS} value={query.mode} onChange={switchMode} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        {metro && (
          <label className="field min-w-0 flex-1">
            <span className="field-label">捷運系統</span>
            <select
              value={query.system}
              onChange={(event) => {
                if (!isMetroSystem(event.target.value)) return;
                setFrom("");
                setTo("");
                go({ system: event.target.value, from: "", to: "" });
              }}
              className="input"
            >
              {Object.entries(METRO_SYSTEMS).map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
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
        {!bus && (
          <>
            <StationSelect
              name="from"
              label="起站"
              value={from}
              options={stations}
              onChange={(value) => {
                setFrom(value);
                if (metro) {
                  setTo("");
                  go({ from: value, to: "" });
                }
              }}
            />
            <StationSelect name="to" label={metro ? "方向" : "迄站"} value={to} options={metro ? directions : stations} prefix={metro ? "往" : ""} onChange={setTo} />
          </>
        )}
        {!metro && !bus && (
          <label className="field min-w-0">
            <span className="field-label">日期</span>
            <input type="date" value={date} min={today} max={maxDate} onChange={(event) => setDate(event.target.value)} className="input" />
          </label>
        )}
        <button className="btn-primary shrink-0">
          <Icon name="search" className="size-4" />
          查詢
        </button>
      </div>
    </form>
  );
}
