import { describe, expect, it } from "vitest";
import { form } from "@/dev/test-helpers";
import { notifyToggleFormData, parseNotifyToggle } from "./notify-toggle-form";

describe("NotifyToggle 的表單欄位", () => {
  it("元件送出的表單_Server Action 解析得回 id 與開關", () => {
    expect(parseNotifyToggle(notifyToggleFormData(3, false))).toEqual({ id: 3, enabled: false });
    expect(parseNotifyToggle(notifyToggleFormData(12, true))).toEqual({ id: 12, enabled: true });
  });

  it.each([
    ["id 不是正整數", { id: "0", enabled: "true" }],
    ["id 不是數字", { id: "abc", enabled: "true" }],
    ["開關不是 true／false", { id: "3", enabled: "on" }],
    ["少了欄位", { id: "3" }],
  ])("%s_回 null", (_name, fields) => {
    expect(parseNotifyToggle(form(fields))).toBeNull();
  });
});
