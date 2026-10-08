import { describe, expect, it } from "vitest";
import { clientIp, createFailureLimiter } from "./rate-limit";

const MIN = 60_000;
const limiter = () => createFailureLimiter({ maxFailures: 5, windowMs: 15 * MIN, lockMs: 15 * MIN });

describe("createFailureLimiter", () => {
  it("失敗 4 次仍可嘗試_第 5 次後鎖住", () => {
    const l = limiter();
    for (let i = 0; i < 4; i++) l.recordFailure("1.1.1.1", 0);
    expect(l.check("1.1.1.1", 0).allowed).toBe(true);

    l.recordFailure("1.1.1.1", 0);
    expect(l.check("1.1.1.1", 0)).toEqual({ allowed: false, retryAfterMs: 15 * MIN });
  });

  it("鎖定時間過後可以再試", () => {
    const l = limiter();
    for (let i = 0; i < 5; i++) l.recordFailure("ip", 0);
    expect(l.check("ip", 15 * MIN - 1).allowed).toBe(false);
    expect(l.check("ip", 15 * MIN).allowed).toBe(true);
  });

  it("超過時間窗的舊失敗不計入", () => {
    const l = limiter();
    for (let i = 0; i < 4; i++) l.recordFailure("ip", 0);
    l.recordFailure("ip", 15 * MIN + 1);
    expect(l.check("ip", 15 * MIN + 1).allowed).toBe(true);
  });

  it("不同 IP 分開計算", () => {
    const l = limiter();
    for (let i = 0; i < 5; i++) l.recordFailure("a", 0);
    expect(l.check("b", 0).allowed).toBe(true);
  });

  it("登入成功後清除紀錄", () => {
    const l = limiter();
    for (let i = 0; i < 4; i++) l.recordFailure("ip", 0);
    l.reset("ip");
    l.recordFailure("ip", 0);
    expect(l.check("ip", 0).allowed).toBe(true);
  });
});

describe("clientIp", () => {
  it.each([
    ["203.0.113.5, 10.0.0.1", "203.0.113.5"],
    ["  198.51.100.7 ", "198.51.100.7"],
    [null, "unknown"],
    ["", "unknown"],
  ])("x-forwarded-for=%j → %s", (header, expected) => {
    expect(clientIp(header)).toBe(expected);
  });
});
