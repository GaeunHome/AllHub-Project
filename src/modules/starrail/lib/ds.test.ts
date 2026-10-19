import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { DS_SALT, generateDs } from "./ds";

describe("generateDs：戰績類介面的 DS 標頭", () => {
  it("取整數秒、帶上亂數，加上 salt、時間與亂數的 md5", () => {
    const ds = generateDs(1_700_000_000_999, () => "abc123");

    const expected = createHash("md5").update(`salt=${DS_SALT}&t=1700000000&r=abc123`).digest("hex");
    expect(ds).toBe(`1700000000,abc123,${expected}`);
  });
});
