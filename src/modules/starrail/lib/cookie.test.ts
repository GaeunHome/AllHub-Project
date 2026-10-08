import { describe, expect, it } from "vitest";
import { parseHoyolabCookie } from "./cookie";

describe("parseHoyolabCookie", () => {
  it("keeps only the HoYoLAB keys it needs", () => {
    const result = parseHoyolabCookie(
      "_ga=GA1.2.3; ltoken_v2=v2_abc; ltuid_v2=123456; mi18nLang=zh-tw; ltmid_v2=mid_x; _gid=xyz",
    );

    expect(result).toEqual({ ok: true, cookie: "ltoken_v2=v2_abc; ltuid_v2=123456; ltmid_v2=mid_x", ltuid: "123456", hasLtmid: true });
  });

  it("keeps values that contain '='", () => {
    const result = parseHoyolabCookie("ltoken_v2=v2_a=b==; ltuid_v2=1");

    expect(result).toMatchObject({ ok: true, cookie: "ltoken_v2=v2_a=b==; ltuid_v2=1" });
  });

  it("tolerates whitespace and newlines from copy-paste", () => {
    const result = parseHoyolabCookie("  ltoken_v2 = v2_abc ;\n ltuid_v2=42 ;  ");

    expect(result).toMatchObject({ ok: true, ltuid: "42" });
  });

  it("reports every missing required key", () => {
    const result = parseHoyolabCookie("ltmid_v2=mid_x");

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain("ltoken_v2、ltuid_v2");
  });

  it("treats an empty value as missing", () => {
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

  it("沒有 ltmid_v2_仍可連結_但標示缺少", () => {
    expect(parseHoyolabCookie("ltoken_v2=v2_abc; ltuid_v2=42")).toMatchObject({ ok: true, hasLtmid: false });
    expect(parseHoyolabCookie("ltoken_v2=v2_abc; ltuid_v2=42; ltmid_v2=m")).toMatchObject({ ok: true, hasLtmid: true });
  });
});
