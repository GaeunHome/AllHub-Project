import type { ReactNode } from "react";
import { Scene } from "@/core/ui/scene";
import type { SearchQuery } from "../search-query";
import { CloseResults } from "./result-parts";
import { EditSearchButton } from "./search-shell";

type ResultSceneProps = { mode: "thsr" | "tra" | "metro"; from: string; to: string; query: SearchQuery; children?: ReactNode };

/** 查詢結果的標題 三種交通工具各一張原創的場景圖 圖片在 public/images/scenes */
export function ResultScene({ mode, from, to, query, children }: ResultSceneProps) {
  return (
    <header>
      <Scene src={`/images/scenes/transit-${mode}.svg`} eager className="trn-scene">
        <div className="trn-scene-body">
          <h2 className="trn-scene-title">
            {from} → {to}
          </h2>
          {children}
        </div>
        <div className="trn-scene-actions">
          <EditSearchButton className="scene-button trn-scene-edit" />
          <CloseResults query={query} className="trn-scene-close" />
        </div>
      </Scene>
    </header>
  );
}
