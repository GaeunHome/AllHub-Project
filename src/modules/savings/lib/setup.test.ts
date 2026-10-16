import { describe, expect, it } from "vitest";
import { parseSkippedSteps, remainingSteps, serializeSkippedSteps, setupStatus } from "./setup";

const rule = (allocate: boolean, holdingId: number | null = null) => ({ allocate, holdingId });
const doneSteps = (sources: Parameters<typeof setupStatus>[0]) =>
  setupStatus(sources)
    .filter((item) => item.done)
    .map((item) => item.step);

describe("開始設定的五步", () => {
  it("照順序：銀行帳戶、信用卡、證券帳戶、薪水、每月固定支出；什麼都沒有時都還沒做", () => {
    expect(setupStatus({ accounts: [], rules: [] })).toEqual([
      { step: "deposit", done: false },
      { step: "credit", done: false },
      { step: "investment", done: false },
      { step: "salary", done: false },
      { step: "recurring", done: false },
    ]);
  });

  it("有存款帳戶、信用卡、投資帳戶就各自完成那一步", () => {
    expect(doneSteps({ accounts: [{ kind: "credit" }], rules: [] })).toEqual(["credit"]);
    expect(doneSteps({ accounts: [{ kind: "deposit" }, { kind: "investment" }], rules: [] })).toEqual(["deposit", "investment"]);
  });

  it("薪水規則只完成薪水；定期定額不算每月固定支出；其他固定收支才完成最後一步", () => {
    expect(doneSteps({ accounts: [], rules: [rule(true)] })).toEqual(["salary"]);
    expect(doneSteps({ accounts: [], rules: [rule(false, 5)] })).toEqual([]);
    expect(doneSteps({ accounts: [], rules: [rule(false)] })).toEqual(["recurring"]);
  });
});

describe("略過這一步", () => {
  it("略過的步驟存成字串再讀回來，順序照五步，認不得的拿掉", () => {
    expect(serializeSkippedSteps(["salary", "credit"])).toBe("credit,salary");
    expect(parseSkippedSteps("salary,credit,owner,salary")).toEqual(["credit", "salary"]);
    expect(parseSkippedSteps("")).toEqual([]);
  });

  it("做完或略過的都不算剩下的；全部做完或略過時清單就不用再出現", () => {
    const status = setupStatus({ accounts: [{ kind: "deposit" }, { kind: "credit" }], rules: [rule(true)] });

    expect(remainingSteps(status, [])).toEqual(["investment", "recurring"]);
    expect(remainingSteps(status, ["investment"])).toEqual(["recurring"]);
    expect(remainingSteps(status, ["investment", "recurring"])).toEqual([]);
  });
});
