import { describe, expect, it } from "vitest";
import { elementLabel, interpretCharacters, parseCharacters, pathLabel, relicSlotLabel } from "./characters";

const IMG = "https://act-webstatic.hoyoverse.com/darkmatter/hkrpg";

/** 依 genshin.py 的 StarRailDetailCharacterResponse 整理的回應（data 的部分） */
function sampleData() {
  return {
    avatar_list: [
      {
        id: 1102,
        name: "希兒",
        element: "Quantum",
        rarity: 5,
        level: 80,
        rank: 2,
        icon: `${IMG}/icon/1102.png`,
        image: `${IMG}/image/1102.png`,
        base_type: 2,
        figure_path: `${IMG}/figure/1102.png`,
        equip: { id: 23001, level: 80, rank: 1, name: "於夜色中", desc: "光錐的長篇說明文字", icon: `${IMG}/equip/23001.png`, rarity: 5 },
        relics: [
          {
            id: 61042,
            pos: 2,
            rarity: 5,
            level: 15,
            name: "天才的網路手套",
            desc: "遺器說明",
            icon: `${IMG}/relic/61042.png`,
            main_property: { property_type: 29, value: "352", times: 0 },
            properties: [
              { property_type: 52, value: "6.4%", times: 2 },
              { property_type: 54, value: "12.9%", times: 3 },
            ],
          },
          {
            id: 61041,
            pos: 1,
            rarity: 5,
            level: 15,
            name: "天才的超距遙感",
            desc: "遺器說明",
            icon: `${IMG}/relic/61041.png`,
            main_property: { property_type: 27, value: "705", times: 0 },
            properties: [{ property_type: 52, value: "3.2%", times: 1 }],
          },
        ],
        ornaments: [
          {
            id: 63065,
            pos: 5,
            rarity: 5,
            level: 15,
            name: "繁星競技場的位面球",
            desc: "飾品說明",
            icon: `${IMG}/relic/63065.png`,
            main_property: { property_type: 61, value: "38.8%", times: 0 },
            properties: [],
          },
        ],
        ranks: [
          { id: 110201, pos: 1, name: "斬盡芳華恐怖", icon: `${IMG}/rank/1.png`, desc: "星魂說明", is_unlocked: true },
          { id: 110202, pos: 2, name: "何人如蝶翩舞", icon: `${IMG}/rank/2.png`, desc: "星魂說明", is_unlocked: false },
        ],
        properties: [
          { property_type: 1, base: "931", add: "+1209", final: "2140" },
          { property_type: 5, base: "0.0%", add: "+64.8%", final: "64.8%" },
        ],
        skills: [
          {
            point_id: "1102001",
            point_type: 2,
            item_url: `${IMG}/skill/basic.png`,
            level: 6,
            is_activated: true,
            is_rank_work: false,
            pre_point: "0",
            anchor: "Point01",
            remake: "普攻",
            skill_stages: [{ name: "強寇", desc: "技能說明", level: 6, remake: "普攻", item_url: `${IMG}/skill/basic.png`, is_activated: true, is_rank_work: false }],
          },
          {
            point_id: "1102101",
            point_type: 3,
            item_url: `${IMG}/skill/major.png`,
            level: 1,
            is_activated: false,
            is_rank_work: false,
            pre_point: "0",
            anchor: "Point06",
            remake: "",
            skill_stages: [{ name: "夜行", desc: "行跡說明", level: 1, remake: "", item_url: `${IMG}/skill/major.png`, is_activated: false, is_rank_work: false }],
          },
          {
            point_id: "1102201",
            point_type: 1,
            item_url: `${IMG}/skill/bonus.png`,
            level: 1,
            is_activated: true,
            is_rank_work: false,
            pre_point: "1102101",
            anchor: "Point09",
            remake: "",
            skill_stages: [{ name: "攻擊強化", desc: "", level: 1, remake: "", item_url: `${IMG}/skill/bonus.png`, is_activated: true, is_rank_work: false }],
          },
        ],
        servant_detail: { servant_id: "0" },
      },
    ],
    equip_wiki: { "23001": "https://wiki.hoyolab.com/pc/hsr/entry/1" },
    relic_wiki: { "61041": "https://wiki.hoyolab.com/pc/hsr/entry/2" },
    property_info: {
      "1": { property_type: 1, name: "生命值", icon: `${IMG}/prop/1.png`, property_name_relic: "生命值", property_name_filter: "生命值" },
      "5": { property_type: 5, name: "暴擊傷害", icon: `${IMG}/prop/5.png`, property_name_relic: "暴擊傷害", property_name_filter: "暴擊傷害" },
      "27": { property_type: 27, name: "生命值", icon: "", property_name_relic: "生命值", property_name_filter: "生命值" },
      "29": { property_type: 29, name: "攻擊力", icon: "", property_name_relic: "攻擊力", property_name_filter: "攻擊力" },
      "52": { property_type: 52, name: "暴擊率", icon: "", property_name_relic: "暴擊率", property_name_filter: "暴擊率" },
      "54": { property_type: 54, name: "暴傷", icon: "", property_name_relic: "暴擊傷害", property_name_filter: "暴擊傷害" },
      "61": { property_type: 61, name: "量子屬性傷害", icon: "", property_name_relic: "", property_name_filter: "量子屬性傷害加成" },
    },
    recommend_property: { "1102": { recommend_relic_properties: [52, 54], custom_relic_properties: [], is_custom_property_valid: false } },
    relic_properties: [],
  };
}

describe("parseCharacters：角色列表與詳情", () => {
  it("角色的基本資料：頭像、名字、等級、星魂、屬性（轉小寫）、命途、稀有度", () => {
    const { characters, missing } = parseCharacters(sampleData());

    expect(missing).toEqual([]);
    expect(characters).toHaveLength(1);
    expect(characters[0]).toMatchObject({
      id: 1102,
      name: "希兒",
      level: 80,
      eidolon: 2,
      rarity: 5,
      element: "quantum",
      path: 2,
      icon: `${IMG}/icon/1102.png`,
      image: `${IMG}/image/1102.png`,
    });
  });

  it("光錐：圖、名字、等級、疊影、稀有度", () => {
    const [seele] = parseCharacters(sampleData()).characters;

    expect(seele.lightCone).toEqual({ id: 23001, name: "於夜色中", level: 80, superimposition: 1, rarity: 5, icon: `${IMG}/equip/23001.png` });
  });

  it("遺器與位面飾品合在一起依位置排序；屬性名稱用 property_info 對照（遺器優先用 property_name_relic），帶強化次數", () => {
    const [seele] = parseCharacters(sampleData()).characters;

    expect(seele.relics.map((r) => r.pos)).toEqual([1, 2, 5]);
    expect(seele.relics[1]).toEqual({
      id: 61042,
      pos: 2,
      name: "天才的網路手套",
      level: 15,
      rarity: 5,
      icon: `${IMG}/relic/61042.png`,
      mainStat: { name: "攻擊力", value: "352", times: 0 },
      subStats: [
        { name: "暴擊率", value: "6.4%", times: 2 },
        { name: "暴擊傷害", value: "12.9%", times: 3 },
      ],
    });
    // property_name_relic 是空字串時退回 name
    expect(seele.relics[2].mainStat).toEqual({ name: "量子屬性傷害", value: "38.8%", times: 0 });
  });

  it("面板數值：基礎、加成、最終，名稱用 property_info 的 name", () => {
    const [seele] = parseCharacters(sampleData()).characters;

    expect(seele.stats).toEqual([
      { type: 1, name: "生命值", base: "931", add: "+1209", final: "2140" },
      { type: 5, name: "暴擊傷害", base: "0.0%", add: "+64.8%", final: "64.8%" },
    ]);
  });

  it("星魂：位置、名字、圖、有沒有解鎖", () => {
    const [seele] = parseCharacters(sampleData()).characters;

    expect(seele.eidolons).toEqual([
      { pos: 1, name: "斬盡芳華恐怖", icon: `${IMG}/rank/1.png`, unlocked: true },
      { pos: 2, name: "何人如蝶翩舞", icon: `${IMG}/rank/2.png`, unlocked: false },
    ]);
  });

  it("行跡：技能（point_type 2）、額外能力（3）、屬性加成（1）", () => {
    const [seele] = parseCharacters(sampleData()).characters;

    expect(seele.traces).toEqual([
      { kind: "skill", name: "強寇", typeLabel: "普攻", level: 6, icon: `${IMG}/skill/basic.png`, activated: true },
      { kind: "major", name: "夜行", typeLabel: null, level: 1, icon: `${IMG}/skill/major.png`, activated: false },
      { kind: "bonus", name: "攻擊強化", typeLabel: null, level: 1, icon: `${IMG}/skill/bonus.png`, activated: true },
    ]);
  });

  it("原始 JSON 不往前端送：說明文字、wiki 連結、推薦屬性都不在結果裡", () => {
    const text = JSON.stringify(parseCharacters(sampleData()));

    for (const raw of ["光錐的長篇說明文字", "遺器說明", "星魂說明", "技能說明", "wiki.hoyolab.com", "recommend", "figure"]) expect(text).not.toContain(raw);
  });

  it("數字是字串也讀得出來；圖片網址不是 http(s) 的給 null", () => {
    const data = sampleData();
    Object.assign(data.avatar_list[0], { level: "70", rank: "0", icon: "javascript:alert(1)" });

    expect(parseCharacters(data).characters[0]).toMatchObject({ level: 70, eidolon: 0, icon: null });
  });

  it("沒有光錐（equip 是 null）_lightCone 是 null，不算缺欄位", () => {
    const data = sampleData();
    Object.assign(data.avatar_list[0], { equip: null });

    const { characters, missing } = parseCharacters(data);
    expect(characters[0].lightCone).toBeNull();
    expect(missing).toEqual([]);
  });

  it("遺器沒有主屬性（main_property 是 null）_mainStat 是 null", () => {
    const data = sampleData();
    Object.assign(data.avatar_list[0].relics[0], { main_property: null });

    expect(parseCharacters(data).characters[0].relics[1].mainStat).toBeNull();
  });
});

describe("parseCharacters：格式跟預期不同時（尚未用真實帳號驗證）", () => {
  it("讀不到的欄位給 null_missing 列出欄位路徑（不帶值、不重複），第一次用真實帳號時看得出哪裡不同", () => {
    const data = sampleData();
    const seele = data.avatar_list[0] as Record<string, unknown>;
    delete seele.name;
    delete seele.level;
    seele.relics = [{ ...data.avatar_list[0].relics[0], name: 42 }, { ...data.avatar_list[0].relics[1], name: null }];

    const { characters, missing } = parseCharacters(data);

    expect(characters[0]).toMatchObject({ id: 1102, name: null, level: null });
    expect(missing).toEqual(["avatar_list[].level", "avatar_list[].name", "avatar_list[].relics[].name"]);
  });

  it("property_info 沒有這個屬性_名稱寫「屬性 編號」，missing 記下編號", () => {
    const data = sampleData();
    data.avatar_list[0].properties.push({ property_type: 999, base: "1", add: "0", final: "1" });

    const { characters, missing } = parseCharacters(data);

    expect(characters[0].stats.at(-1)).toEqual({ type: 999, name: "屬性 999", base: "1", add: "0", final: "1" });
    expect(missing).toEqual(["property_info.999"]);
  });

  it("沒有 avatar_list_空列表_missing 記下", () => {
    expect(parseCharacters({ property_info: {} })).toEqual({ characters: [], missing: ["avatar_list"] });
    expect(parseCharacters(null)).toEqual({ characters: [], missing: ["avatar_list"] });
  });

  it("角色沒有 id_略過這個角色", () => {
    const data = sampleData();
    (data.avatar_list as unknown[]).push({ name: "沒有 id" });

    const { characters, missing } = parseCharacters(data);
    expect(characters.map((c) => c.id)).toEqual([1102]);
    expect(missing).toEqual(["avatar_list[].id"]);
  });

  it("陣列欄位不是陣列_當作空的並記下", () => {
    const data = sampleData();
    Object.assign(data.avatar_list[0], { relics: "oops", ranks: undefined });

    const { characters, missing } = parseCharacters(data);
    expect(characters[0].relics.map((r) => r.pos)).toEqual([5]);
    expect(characters[0].eidolons).toEqual([]);
    expect(missing).toEqual(["avatar_list[].ranks", "avatar_list[].relics"]);
  });
});

describe("interpretCharacters：HoYoLAB 的回應", () => {
  it("成功_回傳角色與缺少的欄位", () => {
    const result = interpretCharacters({ retcode: 0, message: "OK", data: sampleData() });

    expect(result.ok).toBe(true);
    expect(result.ok && result.data.characters[0].name).toBe("希兒");
  });

  it("資料不公開（10102）_中文提示到哪裡打開角色詳情", () => {
    const result = interpretCharacters({ retcode: 10102, message: "Data is not public for the user", data: null });

    expect(result).toMatchObject({ ok: false, retcode: 10102, cookieInvalid: false });
    expect(!result.ok && result.message).toContain("到 HoYoLAB → 戰績 → 設定，打開角色詳情");
    expect(!result.ok && result.message).not.toContain("Data is not public");
  });

  it("cookie 失效（-100）_標記失效", () => {
    expect(interpretCharacters({ retcode: -100, message: "Please login", data: null })).toMatchObject({ ok: false, cookieInvalid: true });
  });

  it("格式不對_不丟錯", () => {
    expect(interpretCharacters("<html>")).toMatchObject({ ok: false, retcode: null });
  });
});

describe("顯示用的名稱", () => {
  it("屬性：七種屬性的中文；認不得的原樣顯示", () => {
    expect(["physical", "fire", "ice", "lightning", "wind", "quantum", "imaginary"].map(elementLabel)).toEqual(["物理", "火", "冰", "雷", "風", "量子", "虛數"]);
    expect(elementLabel("aether")).toBe("aether");
    expect(elementLabel(null)).toBeNull();
  });

  it("命途：base_type 1–9；認不得的回 null", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9].map(pathLabel)).toEqual(["毀滅", "巡獵", "智識", "同諧", "虛無", "存護", "豐饒", "記憶", "歡愉"]);
    expect(pathLabel(42)).toBeNull();
    expect(pathLabel(null)).toBeNull();
  });

  it("遺器位置：1–4 是遺器、5–6 是位面飾品", () => {
    expect([1, 2, 3, 4, 5, 6].map(relicSlotLabel)).toEqual(["頭部", "手部", "軀幹", "腳部", "位面球", "連結繩"]);
    expect(relicSlotLabel(7)).toBe("位置 7");
    expect(relicSlotLabel(null)).toBeNull();
  });
});
