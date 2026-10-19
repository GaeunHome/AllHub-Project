import { describe, expect, it } from "vitest";
import { missingKeysWarning, parseHoyolabCookie, withAccountIds } from "./cookie";

describe("parseHoyolabCookie：只留需要的鍵", () => {
  it("其他追蹤用的 cookie 丟掉，只留 HoYoLAB 介面要用的", () => {
    const result = parseHoyolabCookie(
      "_ga=GA1.2.3; ltoken_v2=v2_abc; ltuid_v2=123456; mi18nLang=zh-tw; ltmid_v2=mid_x; _gid=xyz",
    );

    expect(result).toEqual({
      ok: true,
      cookie: "ltoken_v2=v2_abc; ltuid_v2=123456; ltmid_v2=mid_x",
      ltuid: "123456",
      missing: ["cookie_token_v2", "account_id_v2", "account_mid_v2"],
    });
  });

  it("值裡有等號_照原樣保留", () => {
    const result = parseHoyolabCookie("ltoken_v2=v2_a=b==; ltuid_v2=1");

    expect(result).toMatchObject({ ok: true, cookie: "ltoken_v2=v2_a=b==; ltuid_v2=1" });
  });

  it("複製時夾著空白與換行_照樣解析", () => {
    const result = parseHoyolabCookie("  ltoken_v2 = v2_abc ;\n ltuid_v2=42 ;  ");

    expect(result).toMatchObject({ ok: true, ltuid: "42" });
  });

  it("少了必要的鍵_每個都列出來", () => {
    const result = parseHoyolabCookie("ltmid_v2=mid_x");

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain("ltoken_v2、ltuid_v2");
  });

  it("值是空的_當作沒貼", () => {
    const result = parseHoyolabCookie("ltoken_v2=; ltuid_v2=1");

    expect(!result.ok && result.error).toContain("ltoken_v2");
  });
});

describe("parseHoyolabCookie 分隔與字元檢查", () => {
  it.each([
    ["換行分隔", "ltoken_v2=v2_abc\nltuid_v2=42\nltmid_v2=mid_x"],
    ["tab 分隔", "ltoken_v2=v2_abc\tltuid_v2=42\tltmid_v2=mid_x"],
    ["Windows 換行", "ltoken_v2=v2_abc\r\nltuid_v2=42\r\nltmid_v2=mid_x"],
  ])("%s_可以解析", (_name, input) => {
    expect(parseHoyolabCookie(input)).toMatchObject({ ok: true, cookie: "ltoken_v2=v2_abc; ltuid_v2=42; ltmid_v2=mid_x" });
  });

  it.each([
    ["值中間有空白", "ltoken_v2=v2 abc; ltuid_v2=42"],
    ["值含控制字元", "ltoken_v2=v2_\u0001abc; ltuid_v2=42"],
    ["值含雙引號", 'ltoken_v2=v2_"abc; ltuid_v2=42'],
    ["值含中文", "ltoken_v2=v2_金鑰; ltuid_v2=42"],
  ])("%s_拒絕_錯誤訊息不含原值", (_name, input) => {
    const result = parseHoyolabCookie(input);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain("ltoken_v2");
    expect(!result.ok && result.error).not.toContain("abc");
  });

  it("值被換行切斷（多出沒有等號的片段）_拒絕_錯誤訊息不含片段", () => {
    const result = parseHoyolabCookie("ltoken_v2=v2_abc\nsecretTail; ltuid_v2=42");

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).not.toContain("secretTail");
  });

  it("只有 ltoken_v2、ltuid_v2_仍可連結，列出缺少的建議欄位（ltmid_v2、cookie_token_v2、account_id_v2、account_mid_v2）", () => {
    expect(parseHoyolabCookie("ltoken_v2=v2_abc; ltuid_v2=42")).toMatchObject({ ok: true, missing: ["ltmid_v2", "cookie_token_v2", "account_id_v2", "account_mid_v2"] });
    expect(parseHoyolabCookie("ltoken_v2=v2_abc; ltuid_v2=42; ltmid_v2=m")).toMatchObject({ ok: true, missing: ["cookie_token_v2", "account_id_v2", "account_mid_v2"] });
  });

  it("六個都貼了_沒有缺少的", () => {
    const full = "ltoken_v2=v2_abc; ltuid_v2=42; ltmid_v2=m; cookie_token_v2=v2_ct; account_id_v2=42; account_mid_v2=m";

    expect(parseHoyolabCookie(full)).toMatchObject({ ok: true, missing: [] });
  });
});

describe("missingKeysWarning：連結結果的提醒，寫出少了哪些欄位、哪些功能可能不能用", () => {
  it("少了 ltmid_v2_即時便箋可能不能用", () => {
    const warning = missingKeysWarning(["ltmid_v2"]);

    expect(warning).toContain("ltmid_v2");
    expect(warning).toContain("即時便箋");
    expect(warning).not.toContain("開拓月曆");
    expect(warning).not.toContain("兌換碼");
  });

  it("少了 cookie_token_v2_開拓月曆與兌換碼都不能用（這個補不出來）", () => {
    const warning = missingKeysWarning(["cookie_token_v2"]);

    expect(warning).toContain("cookie_token_v2");
    expect(warning).toContain("開拓月曆");
    expect(warning).toContain("兌換碼");
    expect(warning).not.toContain("即時便箋");
  });

  it("只少了 account_mid_v2_開拓月曆；只少了 account_id_v2_兌換碼", () => {
    expect(missingKeysWarning(["account_mid_v2"])).toContain("開拓月曆");
    expect(missingKeysWarning(["account_mid_v2"])).not.toContain("兌換碼");
    expect(missingKeysWarning(["account_id_v2"])).toContain("兌換碼");
    expect(missingKeysWarning(["account_id_v2"])).not.toContain("開拓月曆");
  });

  it("少了好幾個_每個欄位都列出來，功能不重複", () => {
    const warning = missingKeysWarning(["ltmid_v2", "cookie_token_v2", "account_id_v2", "account_mid_v2"])!;

    for (const key of ["ltmid_v2", "cookie_token_v2", "account_id_v2", "account_mid_v2"]) expect(warning).toContain(key);
    expect(warning.match(/開拓月曆/g)).toHaveLength(1);
    expect(warning.match(/兌換碼/g)).toHaveLength(1);
  });

  it("都貼了_不提醒", () => {
    expect(missingKeysWarning([])).toBeNull();
  });
});

describe("withAccountIds：開拓月曆與兌換沒貼 account_ 開頭的欄位時，用同一個帳號的 lt 值補上", () => {
  const pairs = (cookie: string) => cookie.split(/;\s*/).sort();

  it("沒貼 account_id_v2、account_mid_v2_用 ltuid_v2、ltmid_v2 的值補上，原本的欄位照留", () => {
    expect(pairs(withAccountIds("ltoken_v2=v2_t; ltuid_v2=42; ltmid_v2=mid_x"))).toEqual([
      "account_id_v2=42",
      "account_mid_v2=mid_x",
      "ltmid_v2=mid_x",
      "ltoken_v2=v2_t",
      "ltuid_v2=42",
    ]);
  });

  it("已經貼了的不覆蓋", () => {
    const full = "ltoken_v2=v2_t; ltuid_v2=42; ltmid_v2=mid_x; account_id_v2=7; account_mid_v2=mid_y; cookie_token_v2=v2_ct";

    expect(pairs(withAccountIds(full))).toEqual(pairs(full));
  });

  it("沒有 ltmid_v2_補不出 account_mid_v2（只補 account_id_v2）", () => {
    expect(pairs(withAccountIds("ltoken_v2=v2_t; ltuid_v2=42"))).toEqual(["account_id_v2=42", "ltoken_v2=v2_t", "ltuid_v2=42"]);
  });
});
