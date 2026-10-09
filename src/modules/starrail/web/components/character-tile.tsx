import { elementLabel, pathLabel, type StarrailCharacter } from "../../lib/characters";
import { ElementBadge, Portrait, rarityClass } from "./sr-visuals";

export function CharacterTile({ character, onSelect }: { character: StarrailCharacter; onSelect: () => void }) {
  const { name, level, eidolon, element, rarity } = character;
  const path = pathLabel(character.path);
  const description = [
    name ?? "（未知角色）",
    rarity !== null ? `${rarity} 星` : null,
    level !== null ? `${level} 級` : null,
    eidolon !== null ? `星魂 ${eidolon}` : null,
    elementLabel(element),
    path,
  ]
    .filter(Boolean)
    .join("，");
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={`${description}，查看詳情`}
      className="group flex w-full cursor-pointer flex-col items-stretch gap-1.5 text-left transition-transform motion-safe:hover:-translate-y-0.5"
    >
      {/* 右上切角的頭像框，跟遊戲裡的角色卡一樣 */}
      <span className={`relative block aspect-[4/5] w-full overflow-hidden [clip-path:polygon(0_0,calc(100%-12px)_0,100%_12px,100%_100%,0_100%)] ${rarityClass(rarity)}`}>
        <Portrait src={character.icon} name={name} element={element} className="transition-transform duration-300 motion-safe:group-hover:scale-105" />
        <span className="absolute top-1 left-1">
          <ElementBadge element={element} />
        </span>
        {eidolon !== null && eidolon > 0 && (
          <span className="absolute top-1 right-3 rounded-sm bg-black/60 px-1 text-[0.6875rem] leading-4 font-bold text-white">
            <span className="sr-num">{eidolon}</span> 魂
          </span>
        )}
        <span className="absolute inset-x-0 bottom-0 flex items-end justify-between bg-linear-to-t from-black/80 to-transparent px-1.5 pt-4 pb-0.5 text-white">
          <span className="sr-num text-[0.8125rem] font-semibold text-[#ffe3a3]">{rarity !== null && `${rarity}★`}</span>
          <span className="sr-num text-[0.9375rem] leading-5 font-bold">{level !== null && `Lv.${level}`}</span>
        </span>
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-[0.8125rem] font-semibold text-ink">{name ?? "（未知）"}</span>
        {path && <span className="truncate text-xs text-ink-soft">{path}</span>}
      </span>
    </button>
  );
}
