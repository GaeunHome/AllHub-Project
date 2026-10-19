import { describe, expect, it, vi } from "vitest";
import { fakeFetch } from "@/dev/fake-fetch";
import { captureErrorLog, loggedText } from "@/dev/test-helpers";
import { fetchDailyNote, fetchGameRoles, signIn } from "./hoyolab";

const COOKIE = "ltoken_v2=v2_top_secret; ltuid_v2=42";

describe("hoyolab 網路錯誤", () => {
  it.each([
    ["逾時", new DOMException("The operation was aborted due to timeout", "TimeoutError")],
    ["header 不合法（錯誤訊息含 cookie 原文）", new TypeError(`Headers.append: "${COOKIE}\n" is an invalid header value.`)],
    ["連線失敗", new TypeError("fetch failed")],
  ])("%s_回失敗結果_不丟例外_訊息不含 cookie", async (_name, error) => {
    vi.stubGlobal("fetch", fakeFetch(() => Promise.reject(error)).impl);

    const note = await fetchDailyNote(COOKIE, "900000001", "prod_official_cht");
    const roles = await fetchGameRoles(COOKIE);
    const sign = await signIn(COOKIE);

    expect(note).toMatchObject({ ok: false, cookieInvalid: false });
    expect(!note.ok && note.message).toContain("連不上 HoYoLAB");
    expect(roles.ok).toBe(false);
    expect(sign.result).toBe("failed");
    expect(JSON.stringify([note, roles, sign])).not.toContain("top_secret");
  });
});

describe("hoyolab 回應不是 JSON", () => {
  it("例如被擋或維護時回網頁_畫面說格式不同；log 記路徑與 HTTP 狀態碼，不記回應內容", async () => {
    const log = captureErrorLog();
    vi.stubGlobal("fetch", fakeFetch(() => new Response("<html>ltoken_v2=v2_top_secret</html>", { status: 503 })).impl);

    const note = await fetchDailyNote(COOKIE, "900000001", "prod_official_cht");

    expect(note).toEqual({ ok: false, retcode: null, message: "HoYoLAB 回應格式和預期不同", cookieInvalid: false });
    expect(loggedText(log)).toContain("/game_record/hkrpg/api/note");
    expect(loggedText(log)).toContain("HTTP 503");
    expect(loggedText(log)).not.toContain("top_secret");
  });
});
