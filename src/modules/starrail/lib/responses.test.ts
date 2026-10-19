import { describe, expect, it } from "vitest";
import { ICU_VARIANTS, simulateIcu } from "@/dev/icu-simulation";
import {
  expeditionStates,
  formatRemaining,
  formatTaipeiTime,
  interpretResponse,
  interpretSign,
  parseCheckinInfo,
  parseDailyNote,
  parseExpeditions,
  parseGameRoles,
  parseProfile,
  staminaFullAt,
} from "./responses";

describe("interpretResponse：HoYoLAB 的回應", () => {
  it("retcode 是 0_回傳 data", () => {
    expect(interpretResponse({ retcode: 0, message: "OK", data: { a: 1 } })).toMatchObject({ ok: true, data: { a: 1 } });
  });

  it.each([-100, 10001])("retcode %i_標記 cookie 失效", (retcode) => {
    const result = interpretResponse({ retcode, message: "Please login", data: null });

    expect(result).toMatchObject({ ok: false, retcode, cookieInvalid: true });
    expect(!result.ok && result.message).toContain("重新登入");
  });

  it("其他錯誤_帶著代碼與 HoYoLAB 的訊息", () => {
    const result = interpretResponse({ retcode: 1008, message: "role not found" });

    expect(result).toMatchObject({ ok: false, retcode: 1008, cookieInvalid: false });
    expect(!result.ok && result.message).toContain("1008：role not found");
  });

  it("格式不對_回失敗，不丟錯", () => {
    expect(interpretResponse("<html>")).toMatchObject({ ok: false, retcode: null, cookieInvalid: false });
  });
});

describe("parseGameRoles：帳號底下的角色", () => {
  it("讀出角色_沒有 UID 或伺服器的略過", () => {
    const roles = parseGameRoles({
      list: [
        { game_uid: "900000001", nickname: "開拓者", region: "prod_official_cht", region_name: "TW, HK, MO", level: 70 },
        { game_uid: "", region: "prod_official_asia" },
        { nickname: "no uid" },
      ],
    });

    expect(roles).toEqual([
      { uid: "900000001", nickname: "開拓者", region: "prod_official_cht", regionName: "TW, HK, MO", level: 70 },
    ]);
  });

  it("沒有 list_空的", () => {
    expect(parseGameRoles(null)).toEqual([]);
  });
});

describe("parseDailyNote：即時便箋", () => {
  it("讀出各欄位_委託照 HoYoLAB 原本的拼字 epedition", () => {
    const note = parseDailyNote({
      current_stamina: 180,
      max_stamina: 240,
      stamina_recover_time: 21600,
      current_reserve_stamina: 2400,
      accepted_epedition_num: 4,
      total_expedition_num: 4,
      current_train_score: 500,
      max_train_score: 500,
      current_rogue_score: 14000,
      max_rogue_score: 14000,
      weekly_cocoon_cnt: 3,
      weekly_cocoon_limit: 3,
    });

    expect(note).toEqual({
      stamina: 180,
      maxStamina: 240,
      staminaRecoverSeconds: 21600,
      reserveStamina: 2400,
      expeditionsAccepted: 4,
      expeditionsTotal: 4,
      trainScore: 500,
      maxTrainScore: 500,
      rogueScore: 14000,
      maxRogueScore: 14000,
      cocoonRemaining: 3,
      cocoonLimit: 3,
    });
  });

  it("沒有或看不懂的欄位_null", () => {
    const note = parseDailyNote({ current_stamina: "abc", max_stamina: "240" });

    expect(note.stamina).toBeNull();
    expect(note.maxStamina).toBe(240);
    expect(note.cocoonLimit).toBeNull();
  });
});

describe("staminaFullAt：開拓力回滿的時間", () => {
  const now = new Date("2026-10-07T04:00:00Z");

  it("現在加上回滿要的秒數", () => {
    const note = parseDailyNote({ stamina_recover_time: 3600 });

    expect(staminaFullAt(note, now)?.toISOString()).toBe("2026-10-07T05:00:00.000Z");
  });

  it("已經滿了_null", () => {
    expect(staminaFullAt(parseDailyNote({ stamina_recover_time: 0 }), now)).toBeNull();
  });
});

describe("formatTaipeiTime：照台北時間寫今天、明天或日期", () => {
  // 台北 2026-10-07 12:00
  const now = new Date("2026-10-07T04:00:00Z");

  it("台北的同一天_寫今天", () => {
    expect(formatTaipeiTime(new Date("2026-10-07T10:30:00Z"), now)).toBe("今天 18:30");
  });

  it("過了台北的午夜_寫明天", () => {
    expect(formatTaipeiTime(new Date("2026-10-07T17:05:00Z"), now)).toBe("明天 01:05");
  });

  it("台北的兩天後_寫日期（開拓力從 0 回滿要約 30 小時）", () => {
    // 台北 2026-10-09 02:00
    expect(formatTaipeiTime(new Date("2026-10-08T18:00:00Z"), now)).toBe("10/9 02:00");
  });

  it("跨年也照台北的日曆算", () => {
    // 台北 2026-12-31 20:00 看 2027-01-01 01:05
    expect(formatTaipeiTime(new Date("2026-12-31T17:05:00Z"), new Date("2026-12-31T12:00:00Z"))).toBe("明天 01:05");
  });

  it.each(ICU_VARIANTS)("ICU 的輸出不同時_文字照樣一樣（$name）", (variant) => {
    simulateIcu(variant);

    expect(formatTaipeiTime(new Date("2026-10-07T17:05:00Z"), now)).toBe("明天 01:05");
    expect(formatTaipeiTime(new Date("2026-10-08T18:00:00Z"), now)).toBe("10/9 02:00");
  });
});

describe("parseCheckinInfo：簽到狀態", () => {
  it("讀出今天簽了沒與累計天數", () => {
    expect(parseCheckinInfo({ is_sign: true, total_sign_day: 7 })).toEqual({ isSigned: true, totalSignDay: 7 });
  });

  it("沒有欄位_null", () => {
    expect(parseCheckinInfo({})).toEqual({ isSigned: null, totalSignDay: null });
  });
});

describe("interpretSign：簽到的回應", () => {
  it("retcode 0 而且沒有風控_成功", () => {
    expect(interpretSign({ retcode: 0, message: "OK", data: { code: "ok" } })).toMatchObject({ result: "success" });
  });

  it("-5003_今天已經簽過", () => {
    expect(interpretSign({ retcode: -5003, message: "already" })).toMatchObject({ result: "already", cookieInvalid: false });
  });

  it("HoYoLAB 要求驗證碼_失敗", () => {
    const outcome = interpretSign({ retcode: 0, message: "OK", data: { gt_result: { is_risk: true } } });

    expect(outcome.result).toBe("failed");
    expect(outcome.message).toContain("驗證碼");
  });

  it("cookie 失效_帶著失效標記", () => {
    expect(interpretSign({ retcode: -100, message: "not login" })).toMatchObject({ result: "failed", cookieInvalid: true });
  });
});

describe("interpretResponse：常見的錯誤代碼給中文說明（不顯示 HoYoLAB 的英文原文）", () => {
  it("資料不公開（10102）_提示到戰績設定打開", () => {
    const result = interpretResponse({ retcode: 10102, message: "Data is not public for the user" });

    expect(result).toMatchObject({ ok: false, retcode: 10102, cookieInvalid: false });
    expect(!result.ok && result.message).toContain("HoYoLAB → 戰績 → 設定");
    expect(!result.ok && result.message).toContain("10102");
    expect(!result.ok && result.message).not.toContain("Data is not public");
  });

  it("查詢次數到上限（10101）、太頻繁（-110）、要求驗證碼（1034、10035、10041、5003）", () => {
    const message = (retcode: number) => {
      const result = interpretResponse({ retcode, message: "english detail" });
      return result.ok ? "" : result.message;
    };

    expect(message(10101)).toContain("上限");
    expect(message(-110)).toContain("太頻繁");
    for (const code of [1034, 10035, 10041, 5003]) expect(message(code)).toContain("驗證碼");
    expect(message(10101)).not.toContain("english detail");
  });
});

describe("parseExpeditions：委託的角色圖與剩餘時間", () => {
  it("讀出名稱、狀態、剩餘秒數與角色圖", () => {
    expect(
      parseExpeditions({
        expeditions: [
          {
            avatars: ["https://act-webstatic.hoyoverse.com/a/1.png", "https://act-webstatic.hoyoverse.com/a/2.png"],
            status: "Ongoing",
            remaining_time: 7260,
            name: "看不見的手",
            item_url: "https://act-webstatic.hoyoverse.com/item/1.png",
          },
          { avatars: [], status: "Finished", remaining_time: 0, name: "陽光下的迷宮", item_url: "" },
        ],
      }),
    ).toEqual([
      {
        name: "看不見的手",
        status: "ongoing",
        remainingSeconds: 7260,
        avatars: ["https://act-webstatic.hoyoverse.com/a/1.png", "https://act-webstatic.hoyoverse.com/a/2.png"],
      },
      { name: "陽光下的迷宮", status: "finished", remainingSeconds: 0, avatars: [] },
    ]);
  });

  it("沒有 expeditions 或格式不對_空列表；角色圖不是網址的略過", () => {
    expect(parseExpeditions({})).toEqual([]);
    expect(parseExpeditions(null)).toEqual([]);
    expect(parseExpeditions({ expeditions: [{ avatars: ["not-a-url", 3], status: "?", name: 1 }] })).toEqual([
      { name: null, status: null, remainingSeconds: null, avatars: [] },
    ]);
  });
});

describe("formatRemaining：還剩多久（委託與活動日曆共用）", () => {
  it.each([
    [3 * 86_400 + 5 * 3_600, "剩 3 天"],
    [86_400, "剩 1 天"],
    [86_400 - 1, "剩 23 小時 59 分"],
    [7_260, "剩 2 小時 1 分"],
    [7_200, "剩 2 小時"],
    [2_700, "剩 45 分鐘"],
    [30, "剩不到 1 分鐘"],
  ])("%i 秒_%s", (seconds, text) => {
    expect(formatRemaining(seconds)).toBe(text);
  });

  it("時間到了或讀不到_null（已完成、已結束由畫面依情況寫）", () => {
    expect(formatRemaining(0)).toBeNull();
    expect(formatRemaining(-5)).toBeNull();
    expect(formatRemaining(null)).toBeNull();
  });
});

describe("expeditionStates：委託現在完成了沒（星穹鐵道頁與首頁共用）", () => {
  const fetchedAt = new Date("2026-10-07T04:00:00Z");
  const now = new Date("2026-10-07T04:10:00Z");
  const expedition = (status: "ongoing" | "finished" | null, remainingSeconds: number | null) => ({ name: "委託", status, remainingSeconds, avatars: [] });

  it("剩餘時間扣掉查詢後已經過去的時間", () => {
    expect(expeditionStates([expedition("ongoing", 3600)], fetchedAt, now)).toEqual([{ ...expedition("ongoing", 3000), done: false }]);
  });

  it("時間已經到了_算完成，剩 0 秒", () => {
    expect(expeditionStates([expedition("ongoing", 300)], fetchedAt, now)).toEqual([{ ...expedition("ongoing", 0), done: true }]);
  });

  it("HoYoLAB 說已完成_完成", () => {
    expect(expeditionStates([expedition("finished", 0)], fetchedAt, now)[0].done).toBe(true);
  });

  it("讀不到剩餘時間_沒完成，剩餘時間維持 null", () => {
    expect(expeditionStates([expedition("ongoing", null)], fetchedAt, now)).toEqual([{ ...expedition("ongoing", null), done: false }]);
  });
});

describe("parseProfile：戰績首頁只取遊戲頭像（genshin.py 的 in_game_avatar = cur_head_icon_url）", () => {
  it("讀 cur_head_icon_url", () => {
    const data = { stats: { active_days: 300, avatar_num: 40 }, avatar_list: [], cur_head_icon_url: "https://act-webstatic.hoyoverse.com/darkmatter/hkrpg/head/201102.png" };

    expect(parseProfile(data)).toEqual({ avatar: "https://act-webstatic.hoyoverse.com/darkmatter/hkrpg/head/201102.png", missing: [] });
  });

  it.each([
    ["空字串", { cur_head_icon_url: "" }],
    ["沒有這個欄位", { stats: {} }],
    ["不是 http(s) 網址", { cur_head_icon_url: "javascript:alert(1)" }],
    ["data 不是物件", null],
  ])("%s_給 null 並記下欄位路徑", (_name, data) => {
    expect(parseProfile(data)).toEqual({ avatar: null, missing: ["cur_head_icon_url"] });
  });
});
