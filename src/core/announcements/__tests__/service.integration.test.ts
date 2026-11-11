import { describe, expect, it } from "vitest";
import { setupTestDb } from "@/dev/test-db";
import { cleanupAnnouncements, createAnnouncement, deleteAnnouncement, listAnnouncements, updateAnnouncement } from "../service";

setupTestDb();

const input = (title: string) => ({ kind: "general" as const, title, body: "", startsAt: null, endsAt: null, pinned: false });

describe("公告", () => {
  it("新的在上面", async () => {
    await createAnnouncement(input("第一則"));
    await createAnnouncement(input("第二則"));

    expect((await listAnnouncements()).map((row) => row.title)).toEqual(["第二則", "第一則"]);
  });

  it("修改換掉內容，建立時間不變", async () => {
    const created = await createAnnouncement(input("打錯字"));

    expect(await updateAnnouncement(created.id, { ...input("改好了"), kind: "maintenance" })).toBe(true);

    const [row] = await listAnnouncements();
    expect(row).toMatchObject({ title: "改好了", kind: "maintenance", createdAt: created.createdAt });
  });

  it("修改或刪除不存在的公告回 false", async () => {
    expect(await updateAnnouncement(999, input("不存在"))).toBe(false);
    expect(await deleteAnnouncement(999)).toBe(false);
  });

  it("刪除後就不見了", async () => {
    const created = await createAnnouncement(input("要刪掉"));

    expect(await deleteAnnouncement(created.id)).toBe(true);
    expect(await listAnnouncements()).toEqual([]);
  });
});

describe("cleanupAnnouncements（使用者要的：結束超過一個月的自動刪掉，用 30 天算）", () => {
  const NOW = new Date("2026-12-15T00:00:00Z");
  const ending = (title: string, endsAt: string | null) => createAnnouncement({ ...input(title), endsAt: endsAt === null ? null : new Date(endsAt) });

  it("結束超過 30 天的刪掉；剛好 30 天、30 天內、還沒結束與沒寫結束時間的都留著；摘要寫刪了幾則", async () => {
    await ending("31 天前結束", "2026-11-14T00:00:00Z");
    await ending("剛好 30 天前結束", "2026-11-15T00:00:00Z");
    await ending("上週結束", "2026-12-08T00:00:00Z");
    await ending("還沒結束", "2026-12-20T00:00:00Z");
    await ending("沒寫結束時間", null);

    expect(await cleanupAnnouncements(NOW)).toBe("刪除 1 則結束超過 30 天的公告");
    expect((await listAnnouncements()).map((row) => row.title).sort()).toEqual(["上週結束", "剛好 30 天前結束", "沒寫結束時間", "還沒結束"]);
  });
});
