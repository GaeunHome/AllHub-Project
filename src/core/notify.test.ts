import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setupTestDb } from "@/dev/test-db";
import { coreNotifications } from "./db/schema";
import { notify } from "./notify";

const getDb = setupTestDb();
const rows = () => getDb().select().from(coreNotifications);

afterEach(() => {
  vi.restoreAllMocks();
});

describe("notify（PGlite 整合）", () => {
  it("寫進網站通知：模組 id、種類、標題、內容、連結_一開始是未讀", async () => {
    await notify({
      module: "twitch",
      kind: "stream_online",
      title: "Alice 開台了",
      body: "今天玩鐵道\n分類：Honkai: Star Rail",
      url: "https://twitch.tv/alice",
    });

    const [row] = await rows();
    expect(row).toMatchObject({
      module: "twitch",
      kind: "stream_online",
      title: "Alice 開台了",
      body: "今天玩鐵道\n分類：Honkai: Star Rail",
      url: "https://twitch.tv/alice",
      readAt: null,
    });
    expect(row.createdAt).toBeInstanceOf(Date);
  });

  it("內容與連結可以省略", async () => {
    await notify({ module: "starrail", kind: "checkin", title: "星穹鐵道簽到完成" });

    expect(await rows()).toMatchObject([{ body: "", url: null }]);
  });

  it("站內路徑也可以當連結", async () => {
    await notify({ module: "youtube", kind: "new_video", title: "新影片", url: "/youtube/watch/abcdefghijk" });

    expect((await rows())[0].url).toBe("/youtube/watch/abcdefghijk");
  });

  it.each(["javascript:alert(1)", "//evil.example/x", "data:text/html,hi", "ftp://example.com/x", "/\\evil.example"])(
    "不安全的連結（%s）不存，畫面上才不會變成可點的危險連結",
    async (url) => {
      await notify({ module: "youtube", kind: "new_video", title: "新影片", url });

      expect((await rows())[0].url).toBeNull();
    },
  );

  it.each([
    ["沒有模組 id", { module: "", kind: "x", title: "t" }],
    ["模組 id 格式不對", { module: "Twitch Module", kind: "x", title: "t" }],
    ["沒有標題", { module: "twitch", kind: "x", title: " " }],
    ["沒有種類", { module: "twitch", kind: "", title: "t" }],
  ])("%s_丟錯（呼叫端的程式錯誤），不寫入", async (_name, input) => {
    await expect(notify(input)).rejects.toThrow();
    expect(await rows()).toHaveLength(0);
  });

  it("程式、設定與文件都不再有 Discord（測試裡檢查「沒有」的除外）", () => {
    const root = fileURLToPath(new URL("../../", import.meta.url));
    const sources = readdirSync(join(root, "src"), { recursive: true, encoding: "utf8" })
      .filter((file) => /\.(ts|tsx|mjs)$/.test(file) && !/\.test\.tsx?$/.test(file))
      .map((file) => join("src", file));
    const mentions = [...sources, "README.md", "CLAUDE.md", ".env.example", "vercel.json"].filter((file) => /discord/i.test(readFileSync(join(root, file), "utf8")));

    expect(mentions).toEqual([]);
  });

  it("不再呼叫外部服務（Discord Webhook 已移除）", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await notify({ module: "twitch", kind: "stream_online", title: "Alice 開台了" });

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
