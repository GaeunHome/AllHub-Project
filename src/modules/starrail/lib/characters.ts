// HoYoLAB 戰績的角色詳情（game_record/hkrpg/api/avatar/info）：沒有公開文件，欄位依 genshin.py 的 starrail chronicle 模型整理、尚未用真實帳號驗證；
// 讀不到的欄位給 null 並記下欄位路徑（missing），第一次用真實帳號時從 log 就看得出哪裡不同；原始 JSON（說明文字、wiki 連結）不往前端送

import { asRecord, bool, createMissing, image, number, text } from "./json";
import { interpretResponse, type HoyolabResult } from "./responses";

export type RelicStat = { name: string; value: string | null; times: number | null };

export type Relic = {
  id: number | null;
  /** 1–4 是遺器（頭、手、軀幹、腳），5–6 是位面飾品 */
  pos: number | null;
  name: string | null;
  level: number | null;
  rarity: number | null;
  icon: string | null;
  mainStat: RelicStat | null;
  subStats: RelicStat[];
};

export type LightCone = { id: number | null; name: string | null; level: number | null; superimposition: number | null; rarity: number | null; icon: string | null };

export type Eidolon = { pos: number | null; name: string | null; icon: string | null; unlocked: boolean | null };

export type StatLine = { type: number | null; name: string; base: string | null; add: string | null; final: string | null };

/** skill：普攻、戰技等技能；major：額外能力；bonus：屬性加成 */
export type Trace = { kind: "skill" | "major" | "bonus"; name: string | null; typeLabel: string | null; level: number | null; icon: string | null; activated: boolean | null };

export type StarrailCharacter = {
  id: number;
  name: string | null;
  level: number | null;
  /** 星魂（rank） */
  eidolon: number | null;
  rarity: number | null;
  /** 小寫的英文代號，例如 quantum */
  element: string | null;
  /** 命途（base_type 1–9） */
  path: number | null;
  icon: string | null;
  image: string | null;
  lightCone: LightCone | null;
  relics: Relic[];
  eidolons: Eidolon[];
  stats: StatLine[];
  traces: Trace[];
};

export type CharacterList = { characters: StarrailCharacter[]; missing: string[] };

/** 10102：資料不公開 */
const DATA_NOT_PUBLIC = 10102;
const NOT_PUBLIC_HINT = "角色詳情沒有公開：到 HoYoLAB → 戰績 → 設定，打開角色詳情後再重新整理";

export function interpretCharacters(json: unknown): HoyolabResult<CharacterList> {
  const result = interpretResponse(json);
  if (result.ok) return { ok: true, data: parseCharacters(result.data), raw: json };
  if (result.retcode === DATA_NOT_PUBLIC) return { ...result, message: `${NOT_PUBLIC_HINT}（${result.retcode}）` };
  return result;
}

const TRACE_KINDS: Record<number, Trace["kind"]> = { 1: "bonus", 2: "skill", 3: "major" };

export function parseCharacters(data: unknown): CharacterList {
  const missing = createMissing();
  const need = missing.need;
  const listAt = missing.list;

  const root = asRecord(data);
  const propertyInfo = asRecord(root?.property_info);
  if (root && !propertyInfo) missing.add("property_info");
  const propertyName = (type: number | null, preferRelic: boolean): string => {
    if (type === null) return "屬性";
    const info = asRecord(propertyInfo?.[String(type)]);
    const name = (preferRelic ? text(info?.property_name_relic) : null) ?? text(info?.name);
    if (name) return name;
    missing.add(`property_info.${type}`);
    return `屬性 ${type}`;
  };

  const relicStat = (value: unknown, path: string): RelicStat | null => {
    const stat = asRecord(value);
    if (!stat) return null;
    const type = need(number(stat.property_type), `${path}.property_type`);
    return { name: propertyName(type, true), value: need(text(stat.value), `${path}.value`), times: need(number(stat.times), `${path}.times`) };
  };

  const relic = (value: unknown, path: string): Relic | null => {
    const r = asRecord(value);
    if (!r) return null;
    return {
      id: number(r.id),
      pos: need(number(r.pos), `${path}.pos`),
      name: need(text(r.name), `${path}.name`),
      level: need(number(r.level), `${path}.level`),
      rarity: need(number(r.rarity), `${path}.rarity`),
      icon: need(image(r.icon), `${path}.icon`),
      // 沒裝主屬性時是 null（genshin.py 也略過）
      mainStat: r.main_property === null ? null : relicStat(r.main_property, `${path}.main_property`),
      subStats: listAt(r, "properties", `${path}.properties`).flatMap((s) => relicStat(s, `${path}.properties[]`) ?? []),
    };
  };

  const lightCone = (value: unknown, path: string): LightCone | null => {
    // 沒裝光錐時 equip 是 null，這是正常情況
    if (value === null) return null;
    const equip = asRecord(value);
    if (!equip) return need(null, path);
    return {
      id: number(equip.id),
      name: need(text(equip.name), `${path}.name`),
      level: need(number(equip.level), `${path}.level`),
      superimposition: need(number(equip.rank), `${path}.rank`),
      rarity: need(number(equip.rarity), `${path}.rarity`),
      icon: need(image(equip.icon), `${path}.icon`),
    };
  };

  const character = (value: unknown): StarrailCharacter[] => {
    const c = asRecord(value);
    const id = number(c?.id);
    if (!c || id === null) {
      missing.add("avatar_list[].id");
      return [];
    }
    const at = (key: string) => `avatar_list[].${key}`;
    const relics = [...listAt(c, "relics", at("relics")), ...listAt(c, "ornaments", at("ornaments"))]
      .flatMap((r) => relic(r, at("relics[]")) ?? [])
      .sort((a, b) => (a.pos ?? 99) - (b.pos ?? 99));
    return [
      {
        id,
        name: need(text(c.name), at("name")),
        level: need(number(c.level), at("level")),
        eidolon: need(number(c.rank), at("rank")),
        rarity: need(number(c.rarity), at("rarity")),
        element: need(text(c.element)?.toLowerCase() ?? null, at("element")),
        path: need(number(c.base_type), at("base_type")),
        icon: need(image(c.icon), at("icon")),
        image: need(image(c.image), at("image")),
        lightCone: lightCone(c.equip, at("equip")),
        relics,
        eidolons: listAt(c, "ranks", at("ranks")).flatMap((value) => {
          const rank = asRecord(value);
          if (!rank) return [];
          return [
            {
              pos: need(number(rank.pos), at("ranks[].pos")),
              name: need(text(rank.name), at("ranks[].name")),
              icon: need(image(rank.icon), at("ranks[].icon")),
              unlocked: need(bool(rank.is_unlocked), at("ranks[].is_unlocked")),
            },
          ];
        }),
        stats: listAt(c, "properties", at("properties")).flatMap((value) => {
          const stat = asRecord(value);
          if (!stat) return [];
          const type = need(number(stat.property_type), at("properties[].property_type"));
          return [
            {
              type,
              name: propertyName(type, false),
              base: need(text(stat.base), at("properties[].base")),
              add: need(text(stat.add), at("properties[].add")),
              final: need(text(stat.final), at("properties[].final")),
            },
          ];
        }),
        traces: listAt(c, "skills", at("skills")).flatMap((value) => {
          const skill = asRecord(value);
          const kind = TRACE_KINDS[number(skill?.point_type) ?? -1];
          if (!skill || !kind) {
            missing.add(at("skills[].point_type"));
            return [];
          }
          const stage = asRecord((Array.isArray(skill.skill_stages) ? skill.skill_stages : [])[0]);
          const remake = text(skill.remake) ?? text(stage?.remake);
          return [
            {
              kind,
              name: need(text(stage?.name), at("skills[].skill_stages[].name")),
              // remake 是「普攻」「戰技」這類短標籤；太長的不是標籤，不顯示
              typeLabel: remake && remake.length <= 8 ? remake : null,
              level: need(number(skill.level), at("skills[].level")),
              icon: need(image(skill.item_url), at("skills[].item_url")),
              activated: need(bool(skill.is_activated), at("skills[].is_activated")),
            },
          ];
        }),
      },
    ];
  };

  const list = root?.avatar_list;
  if (!Array.isArray(list)) return { characters: [], missing: ["avatar_list"] };
  const characters = list.flatMap(character);
  return { characters, missing: missing.sorted() };
}

const ELEMENTS: Record<string, string> = { physical: "物理", fire: "火", ice: "冰", lightning: "雷", wind: "風", quantum: "量子", imaginary: "虛數" };
/** 篩選選單的順序 */
export const ELEMENT_ORDER = Object.keys(ELEMENTS);
const PATHS = ["毀滅", "巡獵", "智識", "同諧", "虛無", "存護", "豐饒", "記憶", "歡愉"];
const RELIC_SLOTS = ["頭部", "手部", "軀幹", "腳部", "位面球", "連結繩"];

/** 認不得的屬性原樣顯示，HoYoLAB 新增屬性時至少看得到 */
export function elementLabel(element: string | null): string | null {
  return element === null ? null : (ELEMENTS[element.toLowerCase()] ?? element);
}

export function pathLabel(path: number | null): string | null {
  return path !== null && Number.isInteger(path) && path >= 1 && path <= PATHS.length ? PATHS[path - 1] : null;
}

export function relicSlotLabel(pos: number | null): string | null {
  if (pos === null) return null;
  return RELIC_SLOTS[pos - 1] ?? `位置 ${pos}`;
}
