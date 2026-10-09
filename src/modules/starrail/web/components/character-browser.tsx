"use client";

import { useId, useRef, useState } from "react";
import { Icon } from "@/core/ui/icon";
import { SegmentedControl } from "@/core/ui/segmented-control";
import { elementLabel, type StarrailCharacter } from "../../lib/characters";
import { elementOptions, selectCharacters, type CharacterFilter, type RarityFilter, type SortKey } from "../character-filter";
import { CharacterDetail } from "./character-detail";
import { CharacterTile } from "./character-tile";

const RARITIES: { id: RarityFilter; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "5", label: "★5" },
  { id: "4", label: "★4" },
];
const SORTS: { id: SortKey; label: string }[] = [
  { id: "level", label: "依等級" },
  { id: "rarity", label: "依稀有度" },
  { id: "eidolon", label: "依星魂" },
];

type CharacterBrowserProps = {
  /** 圖片網址已在伺服器端換成瀏覽器載入用的網址 */
  characters: StarrailCharacter[];
  /** 例如「今天 14:05」 */
  fetchedLabel: string;
};

/** 角色列表：篩選、排序都在瀏覽器裡做（資料已經在畫面上，不必再向伺服器要）；點角色用 dialog 打開詳情 */
export function CharacterBrowser({ characters, fetchedLabel }: CharacterBrowserProps) {
  const [filter, setFilter] = useState<CharacterFilter>({ rarity: "all", element: "all", sort: "level" });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const shown = selectCharacters(characters, filter);
  const elements = elementOptions(characters);
  const selected = characters.find((c) => c.id === selectedId) ?? null;

  const open = (id: number) => {
    setSelectedId(id);
    dialogRef.current?.showModal();
  };
  const close = () => dialogRef.current?.close();

  return (
    <section aria-labelledby={`${titleId}-list`} className="stack">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <h3 id={`${titleId}-list`} className="sr-title">
          角色
          <span className="sr-num text-lg font-bold tracking-normal text-sr-gold">
            {shown.length === characters.length ? characters.length : `${shown.length}/${characters.length}`}
          </span>
        </h3>
        <span className="chip">
          <Icon name="clock" className="size-3.5" />
          {fetchedLabel} 更新
        </span>
        {/* 篩選列的三個控制項一樣高（44px）；手機上稀有度一列、兩個下拉選單並排一列，各佔一半 */}
        <div className="grid w-full grid-cols-2 gap-2 sm:ml-auto sm:flex sm:w-auto sm:flex-wrap sm:items-center">
          <div className="col-span-2">
            <SegmentedControl label="稀有度" options={RARITIES} value={filter.rarity} onChange={(rarity) => setFilter({ ...filter, rarity })} />
          </div>
          <select aria-label="屬性" value={filter.element} onChange={(event) => setFilter({ ...filter, element: event.target.value })} className="input text-sm font-medium sm:w-auto">
            <option value="all">全部屬性</option>
            {elements.map((element) => (
              <option key={element} value={element}>
                {elementLabel(element)}
              </option>
            ))}
          </select>
          <select aria-label="排序" value={filter.sort} onChange={(event) => setFilter({ ...filter, sort: event.target.value as SortKey })} className="input text-sm font-medium sm:w-auto">
            {SORTS.map((sort) => (
              <option key={sort.id} value={sort.id}>
                {sort.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {shown.length > 0 ? (
        <ul className="grid grid-cols-4 gap-x-3 gap-y-4 sm:grid-cols-6 lg:grid-cols-8">
          {shown.map((character) => (
            <li key={character.id}>
              <CharacterTile character={character} onSelect={() => open(character.id)} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="sr-panel p-5 text-center text-ink-soft sm:p-6">沒有符合條件的角色</p>
      )}

      {/* 關閉時（Esc、點外面、按 X）清掉選取，下次打開從頭捲起；dialog 也套上星空主題 */}
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onClose={() => setSelectedId(null)}
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
        className="theme-starrail m-auto max-h-[calc(100dvh-2rem)] w-[min(62rem,calc(100vw-2rem))] max-w-none overflow-y-auto overscroll-contain border border-line p-0 text-ink shadow-2xl backdrop:bg-black/65 backdrop:backdrop-blur-sm max-sm:h-dvh max-sm:max-h-none max-sm:w-full max-sm:border-0 sm:[clip-path:polygon(0_0,calc(100%-20px)_0,100%_20px,100%_100%,20px_100%,0_calc(100%-20px))]"
      >
        {selected && <CharacterDetail character={selected} titleId={titleId} onClose={close} />}
      </dialog>
    </section>
  );
}
