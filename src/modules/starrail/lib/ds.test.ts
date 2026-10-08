import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { DS_SALT, generateDs, randomToken } from "./ds";

describe("generateDs", () => {
  it("uses whole seconds, the given random part, and md5 of the salted query", () => {
    const ds = generateDs(1_700_000_000_999, () => "abc123");

    const expected = createHash("md5").update(`salt=${DS_SALT}&t=1700000000&r=abc123`).digest("hex");
    expect(ds).toBe(`1700000000,abc123,${expected}`);
  });

  it("hashes with the documented overseas salt", () => {
    expect(DS_SALT).toBe("6s25p5ox5y14umn1p61aqyyvbvvl3lrt");
  });

  it("produces a 32-char lowercase hex hash", () => {
    const [, , hash] = generateDs(0, () => "zzzzzz").split(",");

    expect(hash).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe("randomToken", () => {
  it("returns 6 lowercase alphanumeric characters", () => {
    for (let i = 0; i < 50; i++) expect(randomToken()).toMatch(/^[a-z0-9]{6}$/);
  });
});
