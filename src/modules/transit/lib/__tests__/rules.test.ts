import { describe, expect, it } from "vitest";
import { parseRoute } from "../rules";

describe("parseRoute：表單送來的常用路線", () => {
  it("高鐵與台鐵要起訖兩站與車次（使用者要的：有車次才加入常用）", () => {
    expect(parseRoute({ mode: "thsr", system: "", line: "0123", originId: "1000", destinationId: "1070" })).toEqual({ ok: true, value: { mode: "thsr", system: "", line: "0123", originId: "1000", destinationId: "1070" } });
  });

  it.each([["thsr"], ["tra"]])("%s 沒有車次_請使用者從查詢結果選一班", (mode) => {
    expect(parseRoute({ mode, system: "", line: "", originId: "1000", destinationId: "1070" })).toEqual({ ok: false, error: "請從查詢結果選一班車" });
  });

  it.each([["1' or 1=1"], ["../1"], ["1".repeat(9)]])("車次 %s 不收", (line) => {
    expect(parseRoute({ mode: "tra", system: "", line, originId: "1000", destinationId: "1080" }).ok).toBe(false);
  });

  it("捷運沒有車次 表單被改過也不留", () => {
    expect(parseRoute({ mode: "metro", system: "TRTC", line: "123", originId: "G09", destinationId: "R28" })).toMatchObject({ value: { line: "" } });
  });

  it("捷運要有系統", () => {
    expect(parseRoute({ mode: "metro", system: "TRTC", line: "", originId: "G09", destinationId: "R28" })).toMatchObject({ ok: true, value: { system: "TRTC" } });
    expect(parseRoute({ mode: "metro", system: "", line: "", originId: "G09", destinationId: "R28" }).ok).toBe(false);
    expect(parseRoute({ mode: "metro", system: "MARS", line: "", originId: "G09", destinationId: "R28" }).ok).toBe(false);
  });

  it.each([["KRTC"], ["KLRT"], ["NTDLRT"], ["NTALRT"]])("捷運只做臺北捷運、環狀線與機場捷運（使用者要的）_%s 不收", (system) => {
    expect(parseRoute({ mode: "metro", system, line: "", originId: "R10", destinationId: "R11" }).ok).toBe(false);
  });

  it("高鐵與台鐵不留系統 表單被改過也一樣", () => {
    expect(parseRoute({ mode: "tra", system: "TRTC", line: "123", originId: "1000", destinationId: "1080" })).toMatchObject({ value: { system: "" } });
  });

  it("起訖站一樣_拒絕", () => {
    expect(parseRoute({ mode: "tra", system: "", line: "123", originId: "1000", destinationId: "1000" }).ok).toBe(false);
  });

  it.each([["../../admin"], [""], ["1000/to/2000"], ["a".repeat(21)]])("車站代碼會放進網址 %s 不收", (originId) => {
    expect(parseRoute({ mode: "tra", system: "", line: "123", originId, destinationId: "1080" }).ok).toBe(false);
  });

  it("公車要縣市 路線與站牌 迄站放方向", () => {
    const bus = { mode: "bus", system: "Taipei", line: "307", originId: "TPE1234", destinationId: "0" };

    expect(parseRoute(bus)).toEqual({ ok: true, value: bus });
    expect(parseRoute({ ...bus, system: "Mars" }).ok).toBe(false);
    expect(parseRoute({ ...bus, line: "307' or 1=1" }).ok).toBe(false);
    expect(parseRoute({ ...bus, destinationId: "東門" }).ok).toBe(false);
  });

  it("不認得的交通工具_拒絕", () => {
    expect(parseRoute({ mode: "plane", system: "", line: "", originId: "1000", destinationId: "1080" }).ok).toBe(false);
  });
});
