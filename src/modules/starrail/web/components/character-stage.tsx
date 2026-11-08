"use client";

import { useState } from "react";
import { ExternalImage } from "@/core/ui/external-image";
import { Icon } from "@/core/ui/icon";
import type { StarrailCharacter } from "../../lib/characters";
import { Portrait } from "./sr-visuals";

/**
 * 立繪接近方形 四周空白多 預設放大到比面板高 臉靠上
 * 讀不到時改放頭像 再不行是屬性色底加名字
 */
export function CharacterStage({ character: c }: { character: StarrailCharacter }) {
  const [whole, setWhole] = useState(false);
  const portrait = <Portrait src={c.icon} name={c.name} element={c.element} />;
  return (
    <div className="sr-stage" data-rarity={c.rarity ?? undefined} data-whole={whole || undefined}>
      {/* fill 要父層是 relative 或 absolute 寬螢幕的舞台是 sticky 所以再包一層 */}
      {c.image ? (
        <div className="sr-stage-art">
          <ExternalImage src={c.image} alt={c.name ?? ""} fill className="object-contain object-center" fallback={portrait} />
        </div>
      ) : (
        <div className="absolute inset-0">{portrait}</div>
      )}
      <span className="absolute inset-x-0 bottom-0 h-1/5 bg-linear-to-t from-black/45 to-transparent" />
      {c.image && (
        <button type="button" aria-pressed={whole} onClick={() => setWhole(!whole)} className="scene-button absolute bottom-3 left-3">
          <Icon name={whole ? "maximize" : "minimize"} className="size-4" />
          {whole ? "放大人物" : "看全圖"}
        </button>
      )}
    </div>
  );
}
