import webpush from "web-push";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeFetch } from "@/dev/fake-fetch";
import { insertTestUsers, setupTestDb } from "@/dev/test-db";
import { captureErrorLog, loggedText } from "@/dev/test-helpers";
import { coreNotifications, corePushMutes, corePushSubscriptions, coreUsers } from "../../db/schema";

const VAPID = webpush.generateVAPIDKeys();
const P256DH = "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM";
const AUTH = "tBHItJI5svbpez7KI4CCXg";

vi.stubEnv("VAPID_PUBLIC_KEY", VAPID.publicKey);
vi.stubEnv("VAPID_PRIVATE_KEY", VAPID.privateKey);
vi.stubEnv("PUBLIC_BASE_URL", "https://allhub.example");
const { notify } = await import("../../notify");

const getDb = setupTestDb();
const device = (userId: string, n: number) => ({ endpoint: `https://fcm.googleapis.com/fcm/send/${n}`, userId, p256dh: P256DH, auth: AUTH });
const message = (recipients: string[]) => ({ recipients, module: "savings", kind: "due", title: "今天到期：Netflix $390" });

let me: string;
let other: string;
beforeEach(async () => {
  [me, other] = await insertTestUsers(getDb());
});

describe("寫完站內通知後推到手機", () => {
  it("收件人的每支手機都送 帶 VAPID 授權 內容是加密的 看不到標題", async () => {
    await getDb().insert(corePushSubscriptions).values([device(me, 1), device(me, 2), device(other, 3)]);
    const fake = fakeFetch(() => new Response(null, { status: 201 }));
    vi.stubGlobal("fetch", fake.impl);

    await notify(message([me]));

    expect([...fake.urls].sort()).toEqual([device(me, 1).endpoint, device(me, 2).endpoint]);
    const { init } = fake.calls[0];
    expect(String((init.headers as Record<string, string>).Authorization)).toMatch(/^vapid /);
    expect(Buffer.from(init.body as Uint8Array).toString("latin1")).not.toContain("Netflix");
  });

  it("給了 push 時手機上用它 鎖定畫面看不到鈴鐺裡的金額 tag 用的通知 id 跟頁面的系統通知一樣", async () => {
    await getDb().insert(corePushSubscriptions).values(device(me, 1));
    vi.stubGlobal("fetch", fakeFetch(() => new Response(null, { status: 201 })).impl);
    const details = vi.spyOn(webpush, "generateRequestDetails");

    await notify({ ...message([me]), url: "/savings", push: { title: "理財有一件事要處理" } });

    const [notice] = await getDb().select().from(coreNotifications);
    expect(notice.title).toBe("今天到期：Netflix $390");
    expect(JSON.parse(String(details.mock.calls[0][1]))).toEqual({ id: notice.id, title: "理財有一件事要處理", body: "", url: "/savings" });
    details.mockRestore();
  });

  it("這支手機關掉這個模組：不送 別的模組照送", async () => {
    await getDb().insert(corePushSubscriptions).values(device(me, 1));
    await getDb().insert(corePushMutes).values({ endpoint: device(me, 1).endpoint, moduleId: "savings" });
    const fake = fakeFetch(() => new Response(null, { status: 201 }));
    vi.stubGlobal("fetch", fake.impl);

    await notify(message([me]));
    expect(fake.urls).toEqual([]);

    await notify({ ...message([me]), module: "twitch" });
    expect(fake.urls).toHaveLength(1);
  });

  it("停用的人：站內通知不寫 手機也不送", async () => {
    await getDb().insert(corePushSubscriptions).values(device(other, 1));
    await getDb().update(coreUsers).set({ disabledAt: new Date() });
    const fake = fakeFetch(() => new Response(null, { status: 201 }));
    vi.stubGlobal("fetch", fake.impl);

    await notify(message([other]));

    expect(fake.urls).toEqual([]);
  });

  it.each([404, 410])("推送服務回 %d：手機已經不在了 刪掉不再送", async (status) => {
    await getDb().insert(corePushSubscriptions).values([device(me, 1), device(me, 2)]);
    vi.stubGlobal("fetch", fakeFetch(({ url }) => new Response(null, { status: url.endsWith("/1") ? status : 201 })).impl);

    await notify(message([me]));

    expect((await getDb().select().from(corePushSubscriptions)).map(({ endpoint }) => endpoint)).toEqual([device(me, 2).endpoint]);
  });

  it("推送失敗不能丟出去：丟出去認領會被放掉 站內通知會重寄一次 log 不記網址", async () => {
    await getDb().insert(corePushSubscriptions).values(device(me, 1));
    const log = captureErrorLog();
    vi.stubGlobal("fetch", fakeFetch(() => { throw new TypeError("fetch failed"); }).impl);

    await expect(notify(message([me]))).resolves.toBeUndefined();

    expect(loggedText(log)).not.toContain("fcm.googleapis.com");
    expect(await getDb().select().from(corePushSubscriptions)).toHaveLength(1);
  });

  it("一支手機金鑰壞掉 不影響同一批的其他手機", async () => {
    await getDb().insert(corePushSubscriptions).values([{ ...device(me, 1), p256dh: "broken" }, device(me, 2)]);
    captureErrorLog();
    const fake = fakeFetch(() => new Response(null, { status: 201 }));
    vi.stubGlobal("fetch", fake.impl);

    await notify(message([me]));

    expect(fake.urls).toEqual([device(me, 2).endpoint]);
  });
});
