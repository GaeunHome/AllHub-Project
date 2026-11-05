import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { insertTestUsers, setupTestDb } from "@/dev/test-db";
import { stubCoreEnv } from "@/dev/test-env";
import { coreAvatarImages, coreUsers } from "../db/schema";
import { AVATAR_STORED_MAX_BYTES, KEEP_AVATAR } from "./avatar-rules";

stubCoreEnv();
const { readAvatarImage, saveUploadedAvatar, updateAvatar } = await import("./users");

const getDb = setupTestDb();
const jpeg = (fill = 1, size = 1000) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(size, fill)]);
const avatarOf = async (id: string) => (await getDb().select({ avatar: coreUsers.avatar }).from(coreUsers).where(eq(coreUsers.id, id)))[0].avatar;
const imagesOf = (id: string) => getDb().select().from(coreAvatarImages).where(eq(coreAvatarImages.userId, id));

let me: string;
let other: string;
beforeEach(async () => {
  [me, other] = await insertTestUsers(getDb());
});

describe("上傳自己的頭像", () => {
  it("存進資料庫 帳號記下這張圖", async () => {
    const result = await saveUploadedAvatar(me, jpeg());

    expect(result.ok).toBe(true);
    const [image] = await imagesOf(me);
    expect(await avatarOf(me)).toBe(`img:${image.id}`);
    expect(Buffer.from(await readAvatarImage(image.id) as Buffer)).toEqual(jpeg());
  });

  it("換一張照片_舊的刪掉 每人只留一張 網址也換新 瀏覽器才不會留著舊圖", async () => {
    await saveUploadedAvatar(me, jpeg(1));
    const [first] = await imagesOf(me);
    await saveUploadedAvatar(me, jpeg(2));

    const images = await imagesOf(me);
    expect(images).toHaveLength(1);
    expect(images[0].id).not.toBe(first.id);
    expect(await readAvatarImage(first.id)).toBeNull();
  });

  it("不是 JPEG_不寫入 瀏覽器一定會轉成 JPEG 這是直接送來的", async () => {
    expect(await saveUploadedAvatar(me, Buffer.from("<script>alert(1)</script>"))).toMatchObject({ ok: false });
    expect(await imagesOf(me)).toEqual([]);
  });

  it("太大_不寫入 資料庫才不會被塞滿", async () => {
    expect(await saveUploadedAvatar(me, jpeg(1, AVATAR_STORED_MAX_BYTES))).toMatchObject({ ok: false });
    expect(await imagesOf(me)).toEqual([]);
  });

  it("換回範例頭像_上傳的照片一起刪 不留在資料庫佔空間", async () => {
    await saveUploadedAvatar(me, jpeg());

    await updateAvatar(me, "cat");

    expect(await imagesOf(me)).toEqual([]);
    expect(await avatarOf(me)).toBe("cat");
  });

  it("改回文字頭像_一樣刪", async () => {
    await saveUploadedAvatar(me, jpeg());

    await updateAvatar(me, "");

    expect(await imagesOf(me)).toEqual([]);
  });

  it("視窗裡留著目前的照片按儲存_什麼都不變", async () => {
    await saveUploadedAvatar(me, jpeg());
    const before = await avatarOf(me);

    expect(await updateAvatar(me, KEEP_AVATAR)).toMatchObject({ ok: true });

    expect(await avatarOf(me)).toBe(before);
    expect(await imagesOf(me)).toHaveLength(1);
  });

  it("不能直接把帳號指到別人上傳的圖", async () => {
    await saveUploadedAvatar(other, jpeg());
    const [image] = await imagesOf(other);

    expect(await updateAvatar(me, `img:${image.id}`)).toMatchObject({ ok: false });
  });

  it("刪除帳號_照片跟著刪", async () => {
    await saveUploadedAvatar(me, jpeg());

    await getDb().delete(coreUsers).where(eq(coreUsers.id, me));

    expect(await imagesOf(me)).toEqual([]);
  });

  it("查不到的圖_null", async () => {
    expect(await readAvatarImage("00000000-0000-4000-8000-000000000000")).toBeNull();
  });
});
