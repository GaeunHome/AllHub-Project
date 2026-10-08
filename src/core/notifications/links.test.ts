import { describe, expect, it } from "vitest";
import { linkTarget } from "./links";

describe("linkTarget", () => {
  it.each([
    ["https://twitch.tv/alice", { href: "https://twitch.tv/alice", external: true }],
    ["http://example.com/x?y=1", { href: "http://example.com/x?y=1", external: true }],
    ["/youtube/watch/abcdefghijk", { href: "/youtube/watch/abcdefghijk", external: false }],
    ["/starrail", { href: "/starrail", external: false }],
  ])("%s → 可以開啟", (url, expected) => {
    expect(linkTarget(url)).toEqual(expected);
  });

  it.each([null, "", "javascript:alert(1)", "JavaScript:alert(1)", "//evil.example/x", "/\\evil.example", "data:text/html,x", "mailto:a@example.com", "youtube.com/watch?v=x"])(
    "%j → 不當成連結",
    (url) => {
      expect(linkTarget(url)).toBeNull();
    },
  );
});
