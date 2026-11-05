"use client";

import { useState, useTransition } from "react";
import { Dialog, useDialog, useDialogForm } from "@/core/ui/dialog";
import { FormButtons } from "@/core/ui/form-buttons";
import { FormFeedback } from "@/core/ui/form-message";
import { Icon } from "@/core/ui/icon";
import { WORLD_CITIES } from "../../lib/cities";
import { COUNTIES } from "../../lib/counties";
import type { WorldPlace } from "../../lib/weekly";
import { addPlaceAction, searchCitiesAction } from "../actions";

const worldChoice = (place: WorldPlace) => JSON.stringify({ kind: "world", ...place });

function PlaceForm({ onDone, onCancel }: { onDone: (message: string | undefined) => void; onCancel: () => void }) {
  const { state, pending, formProps } = useDialogForm(addPlaceAction, onDone);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<WorldPlace[] | null>(null);
  const [searching, startSearch] = useTransition();
  const search = () => startSearch(async () => setFound(await searchCitiesAction(query)));

  return (
    <form {...formProps} className="stack">
      <label className="field">
        <span className="field-label">城市</span>
        <select name="choice" required defaultValue="" data-autofocus className="input" key={found?.length ?? 0}>
          <option value="" disabled>
            請選擇
          </option>
          {found && found.length > 0 && (
            <optgroup label="搜尋結果">
              {found.map((place) => (
                <option key={`${place.latitude},${place.longitude}`} value={worldChoice(place)}>
                  {place.name}
                </option>
              ))}
            </optgroup>
          )}
          <optgroup label="台灣">
            {COUNTIES.map((name) => (
              <option key={name} value={JSON.stringify({ kind: "county", name })}>
                {name}
              </option>
            ))}
          </optgroup>
          <optgroup label="常用城市">
            {WORLD_CITIES.map((place) => (
              <option key={place.name} value={worldChoice(place)}>
                {place.name}
              </option>
            ))}
          </optgroup>
        </select>
      </label>
      <div className="field">
        <label htmlFor="weather-city-search" className="field-label">
          找不到的話用英文搜尋
        </label>
        <div className="flex gap-2">
          <input id="weather-city-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="例如 Busan" autoComplete="off" className="input min-w-0 flex-1" />
          <button type="button" onClick={search} disabled={searching || query.trim() === ""} className="btn-secondary shrink-0">
            <Icon name="search" className="size-4" />
            {searching ? "搜尋中…" : "搜尋"}
          </button>
        </div>
        {found?.length === 0 && <p role="status" className="text-ink">找不到這個城市，換個英文名稱試試</p>}
      </div>
      {!pending && <FormFeedback state={{ error: state.error }} />}
      <FormButtons pending={pending} onCancel={onCancel} label="新增" pendingLabel="新增中…" icon="plus" />
    </form>
  );
}

export function AddPlaceButton({ className = "wx-chip" }: { className?: string }) {
  const dialog = useDialog();
  return (
    <>
      <button {...dialog.triggerProps} className={className}>
        <Icon name="plus" className="size-4" />
        新增城市
      </button>
      <Dialog {...dialog.dialogProps} title="新增城市" size="sm">
        <PlaceForm onDone={dialog.done} onCancel={dialog.close} />
      </Dialog>
    </>
  );
}
