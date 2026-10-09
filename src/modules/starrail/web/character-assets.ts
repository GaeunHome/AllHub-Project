import type { StarrailCharacter } from "../lib/characters";

/** 角色資料裡每個圖片網址都換成瀏覽器載入用的網址（伺服器端傳入 core/external-url 的 externalAssetUrl）；新增圖片欄位要一起加，測試會檢查 */
export function characterAssetUrls(characters: StarrailCharacter[], asset: (url: string | null) => string | null): StarrailCharacter[] {
  return characters.map((c) => ({
    ...c,
    icon: asset(c.icon),
    image: asset(c.image),
    lightCone: c.lightCone && { ...c.lightCone, icon: asset(c.lightCone.icon) },
    relics: c.relics.map((relic) => ({ ...relic, icon: asset(relic.icon) })),
    eidolons: c.eidolons.map((eidolon) => ({ ...eidolon, icon: asset(eidolon.icon) })),
    traces: c.traces.map((trace) => ({ ...trace, icon: asset(trace.icon) })),
  }));
}
