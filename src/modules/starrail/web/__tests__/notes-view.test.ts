import { describe, expect, it } from "vitest";
import type { DailyNote } from "../../lib/responses";
import type { DailyNoteFetch } from "../../service/page-reads";
import { accountNotice } from "../notes-view";

const account = { nickname: "三月七" };
const note = (stamina: number | null, maxStamina: number | null) => ({ ok: true, note: { stamina, maxStamina } as DailyNote, expeditions: [], fetchedAt: new Date(), cookieInvalid: false }) as DailyNoteFetch;
const failed = (cookieInvalid: boolean) => ({ ok: false, message: "讀不到", cookieInvalid }) as DailyNoteFetch;

describe("首頁要提醒的事（一個帳號最多一件）", () => {
  it("cookie 失效是最要緊的：寫出是哪個帳號", () => {
    expect(accountNotice(account, failed(true))).toEqual({ tone: "danger", title: "HoYoLAB cookie 已失效", detail: "三月七" });
  });

  it("只是暫時讀不到便箋_不提醒，便箋卡片自己會說明", () => {
    expect(accountNotice(account, failed(false))).toBeNull();
  });

  it("開拓力到九成提醒，還差一點不提醒", () => {
    expect(accountNotice(account, note(216, 240))).toEqual({ tone: "warning", title: "開拓力快滿了", detail: "三月七 216 / 240" });
    expect(accountNotice(account, note(215, 240))).toBeNull();
  });

  it("沒有暱稱時叫開拓者", () => {
    expect(accountNotice({ nickname: null }, note(240, 240))?.detail).toBe("開拓者 240 / 240");
  });

  it("讀不到開拓力欄位_不提醒", () => {
    expect(accountNotice(account, note(null, null))).toBeNull();
  });
});
