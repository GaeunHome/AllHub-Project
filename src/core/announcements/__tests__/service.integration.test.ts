import { describe, expect, it } from "vitest";
import { setupTestDb } from "@/dev/test-db";
import { createAnnouncement, deleteAnnouncement, listAnnouncements, updateAnnouncement } from "../service";

setupTestDb();

const input = (title: string) => ({ kind: "general" as const, title, body: "", startsAt: null, endsAt: null });

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
