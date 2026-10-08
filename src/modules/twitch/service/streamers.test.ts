import { describe, expect, it } from "vitest";
import { normalizeLogin } from "./streamers";

describe("normalizeLogin", () => {
  it.each([
    ["Shroud", "shroud"],
    ["  @Shroud ", "shroud"],
    ["https://www.twitch.tv/shroud", "shroud"],
    ["twitch.tv/shroud", "shroud"],
    ["https://twitch.tv/shroud/videos?filter=all", "shroud"],
  ])("輸入%s_得到%s", (input, expected) => {
    expect(normalizeLogin(input)).toBe(expected);
  });
});
