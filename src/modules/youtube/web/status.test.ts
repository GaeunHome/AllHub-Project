import { describe, expect, it } from "vitest";
import { ICU_VARIANTS, simulateIcu } from "@/dev/icu-simulation";
import { channelStatusBadge, describeChannelStatus, describeTranslationStatus, describeZhCaptions } from "./status";

describe("describeChannelStatus", () => {
  const now = new Date("2026-10-07T00:00:00Z");
  it.each([
    [null, null, "未訂閱"],
    ["pending", null, "等待 hub 確認"],
    ["subscribed", new Date("2026-10-10T00:00:00Z"), "正常（10/10 到期，會自動續訂）"],
    ["訂閱失敗：hub 回應 400", null, "訂閱失敗：hub 回應 400"],
  ])("%s", (status, lease, expected) => {
    expect(describeChannelStatus(status, lease, now)).toBe(expected);
  });

  it.each(ICU_VARIANTS)("ICU 版本不同（$name）_到期日還是台北的 M/D", (variant) => {
    simulateIcu(variant);

    // 台北 2027/1/5 01:05
    expect(describeChannelStatus("subscribed", new Date("2027-01-04T17:05:00Z"), now)).toBe("正常（1/5 到期，會自動續訂）");
  });
});

describe("describeTranslationStatus", () => {
  it.each([
    [null, "翻譯觀看"],
    ["queued", "翻譯中"],
    ["running", "翻譯中"],
    ["done", "觀看（已翻譯）"],
    ["failed", "翻譯失敗"],
  ] as const)("%s → %s", (status, expected) => {
    expect(describeTranslationStatus(status)).toBe(expected);
  });
});

describe("describeZhCaptions", () => {
  it.each([
    ["yes", "有中文字幕", "chip chip-success"],
    ["no", "沒有中文字幕", "chip"],
    ["unknown", "字幕未確認", "chip chip-warning"],
  ] as const)("%s → %s", (status, label, chip) => {
    expect(describeZhCaptions(status)).toEqual({ label, chip });
  });
});

describe("channelStatusBadge：訂閱狀態改成標籤（不用灰色小字）", () => {
  const now = new Date("2026-10-07T00:00:00Z");

  it.each([
    [null, null, { label: "未訂閱", tone: "warning", detail: null }],
    ["pending", null, { label: "等待 hub 確認", tone: "warning", detail: null }],
    ["subscribed", null, { label: "訂閱正常", tone: "success", detail: null }],
    ["subscribed", new Date("2026-10-10T00:00:00Z"), { label: "訂閱正常", tone: "success", detail: "10/10 到期，會自動續訂" }],
    ["subscribed", new Date("2026-10-01T00:00:00Z"), { label: "租約過期，等待續訂", tone: "warning", detail: null }],
    ["訂閱失敗：hub 回應 400", null, { label: "訂閱失敗", tone: "danger", detail: "hub 回應 400" }],
    ["訂閱失敗：hub 拒絕（unknown topic）", null, { label: "訂閱失敗", tone: "danger", detail: "hub 拒絕（unknown topic）" }],
  ])("%s", (status, lease, expected) => {
    expect(channelStatusBadge(status, lease, now)).toEqual(expected);
  });
});
