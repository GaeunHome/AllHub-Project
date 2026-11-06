"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Icon } from "@/core/ui/icon";
import { BUS_CITIES, isBusCity } from "../../lib/bus";
import type { Mode } from "../../lib/modes";
import type { StationGroup } from "../../lib/station-groups";
import { isSameStation } from "../../lib/station-search";
import type { Station } from "../../lib/timetable";
import { searchHref, type SearchQuery } from "../search-query";
import { ModeTabs } from "./mode-tabs";
import { useSearchEdit } from "./search-shell";
import { StationPicker } from "./station-picker";

type SearchFormProps = { query: SearchQuery; stations: Station[]; groups: StationGroup[]; frequent: Station[]; today: string; maxDate: string };

function StationSelect({ name, label, value, options, except, onChange }: { name: string; label: string; value: string; options: Station[]; except: Station | null; onChange: (value: string) => void }) {
  return (
    <label className="field min-w-0 flex-1">
      <span className="field-label">{label}</span>
      <select name={name} value={value} onChange={(event) => onChange(event.target.value)} className="input">
        <option value="">請選擇</option>
        {options
          .filter((station) => !except || !isSameStation(station, except))
          .map((station) => (
            <option key={station.id} value={station.id}>
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

/** 換站只改表單 按查詢才換網址 才不會每動一個欄位就問 TDX */
export function SearchForm({ query, stations, groups, frequent, today, maxDate }: SearchFormProps) {
  const router = useRouter();
  const { collapsed, finish } = useSearchEdit();
  const [from, setFrom] = useState(query.from);
  const [to, setTo] = useState(query.to);
  const [date, setDate] = useState(query.date);
  const [time, setTime] = useState(query.time);
  const [line, setLine] = useState(query.line);
  const metro = query.mode === "metro";
  const bus = query.mode === "bus";
  const tra = query.mode === "tra";
  const picker = { stations, groups, frequent };
  const stationOf = (id: string) => stations.find((station) => station.id === id) ?? frequent.find((station) => station.id === id) ?? null;
  const go = (next: Partial<SearchQuery>) => router.replace(searchHref({ ...query, from, to, date, time, line: line.trim(), direction: 0, ...next }), { scroll: false });
  const switchMode = (mode: Mode) => {
    setFrom("");
    setTo("");
    setLine("");
    setTime("");
    go({ mode, system: mode === "bus" ? "Taipei" : "", line: "", from: "", to: "", time: "" });
  };
  // 使用者要的 只對調兩站 按查詢才問 TDX
  const swap = () => {
    setFrom(to);
    setTo(from);
  };
  const filled = from !== "" || to !== "" || line !== "" || time !== "" || date !== today;
  // 使用者要的 表單與查詢結果一起清掉 交通工具與縣市留著
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
    finish();
    go({});
  };

  return (
    <form id="transit-search" onSubmit={submit} className="card trn-search p-0 overflow-hidden">
      <ModeTabs value={query.mode} onChange={switchMode} />
      {!collapsed && (
        <div className="trn-search-fields">
          {bus ? (
            <>
              <label className="field min-w-0">
                <span className="field-label">縣市</span>
                <select value={query.system} onChange={(event) => isBusCity(event.target.value) && go({ system: event.target.value, line: "" })} className="input">
                  {Object.entries(BUS_CITIES).map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field min-w-0">
                <span className="field-label">路線</span>
                <input value={line} onChange={(event) => setLine(event.target.value)} placeholder="例如 307、紅30" autoComplete="off" className="input" />
              </label>
            </>
          ) : (
            <div className="trn-search-route">
              {tra || metro ? <StationPicker label="起站" value={from} except={stationOf(to)} onChange={setFrom} {...picker} /> : <StationSelect name="from" label="起站" value={from} options={stations} except={stationOf(to)} onChange={setFrom} />}
              <SwapButton onClick={swap} />
              {tra || metro ? <StationPicker label="迄站" value={to} except={stationOf(from)} onChange={setTo} {...picker} /> : <StationSelect name="to" label="迄站" value={to} options={stations} except={stationOf(from)} onChange={setTo} />}
            </div>
          )}
          {!metro && !bus && (
            <>
              <label className="field min-w-0">
                <span className="field-label">日期</span>
                <input type="date" value={date} min={today} max={maxDate} onChange={(event) => setDate(event.target.value)} className="input" />
              </label>
              <label className="field min-w-0">
                <span className="field-label">出發時間</span>
                <input type="time" value={time} onChange={(event) => setTime(event.target.value)} className="input" />
              </label>
            </>
          )}
          <div className="trn-search-buttons">
            <button className="btn-primary">
              <Icon name="search" className="size-4" />
              查詢
            </button>
            {filled && (
              <button type="button" onClick={clear} className="btn-secondary">
                清除
              </button>
            )}
          </div>
        </div>
      )}
    </form>
  );
}
