import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeFetch } from "@/dev/fake-fetch";
import { fetchDailyNote, fetchGameRoles, signIn } from "./hoyolab";

const COOKIE = "ltoken_v2=v2_top_secret; ltuid_v2=42";

afterEach(() => vi.unstubAllGlobals());

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
