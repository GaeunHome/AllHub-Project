import { describe, expect, it } from "vitest";
import { parseRoute } from "./rules";

describe("parseRoute：表單送來的常用路線", () => {
  it("高鐵與台鐵要起訖兩站", () => {
    expect(parseRoute({ mode: "thsr", system: "", line: "", originId: "1000", destinationId: "1070" })).toEqual({ ok: true, value: { mode: "thsr", system: "", line: "", originId: "1000", destinationId: "1070" } });
  });

  it("捷運要有系統", () => {
    expect(parseRoute({ mode: "metro", system: "TRTC", line: "", originId: "G09", destinationId: "R28" })).toMatchObject({ ok: true, value: { system: "TRTC" } });
    expect(parseRoute({ mode: "metro", system: "", line: "", originId: "G09", destinationId: "R28" }).ok).toBe(false);
    expect(parseRoute({ mode: "metro", system: "MARS", line: "", originId: "G09", destinationId: "R28" }).ok).toBe(false);
  });

  it("高鐵與台鐵不留系統 表單被改過也一樣", () => {
    expect(parseRoute({ mode: "tra", system: "TRTC", line: "", originId: "1000", destinationId: "1080" })).toMatchObject({ value: { system: "" } });
  });

  it("起訖站一樣_拒絕", () => {
    expect(parseRoute({ mode: "tra", system: "", line: "", originId: "1000", destinationId: "1000" }).ok).toBe(false);
  });

  it.each([["../../admin"], [""], ["1000/to/2000"], ["a".repeat(21)]])("車站代碼會放進網址 %s 不收", (originId) => {
    expect(parseRoute({ mode: "tra", system: "", line: "", originId, destinationId: "1080" }).ok).toBe(false);
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
