import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { setupTestDb } from "@/dev/test-db";
import { coreAuditLogs, coreUsers } from "../../db/schema";

vi.unmock("@/core/audit");
vi.mock("../../auth", () => import("@/dev/session-stub"));

const { MERGED_ROWS_PER_HOUR, UNKNOWN_ACCOUNT, cleanupAudit, writeAudit, writeLoginFailure, writeMergedFailure } = await import("..");

const getDb = setupTestDb();
const NOW = new Date("2026-11-04T02:10:00Z");
const ACTOR = { id: "6f1c2b9e-3a4d-4c5e-8f70-1a2b3c4d5e6f", name: "alice", ip: "203.0.113.7" };
const GUEST = { id: null, name: "（未登入）", ip: "203.0.113.7" };
const rows = () => getDb().select().from(coreAuditLogs).orderBy(coreAuditLogs.id);

describe("操作紀錄", () => {
  it("記下誰、哪個 IP、哪個功能、做了什麼、對象、結果", async () => {
    await writeAudit(ACTOR, [{ module: "admin", action: "停用帳號", target: "bob" }], NOW);

    expect((await rows())[0]).toMatchObject({ actorId: ACTOR.id, actorName: "alice", ip: "203.0.113.7", module: "admin", action: "停用帳號", target: "bob", outcome: "success", attempts: 1, createdAt: NOW });
  });

  it("同一次操作的幾列共用一個批次編號，不同次操作不同", async () => {
    await writeAudit(ACTOR, [{ module: "auth", action: "註冊帳號" }, { module: "auth", action: "使用邀請連結" }], NOW);
    await writeAudit(ACTOR, [{ module: "auth", action: "登入成功" }], NOW);

    const [first, second, third] = await rows();
    expect(first.batchId).toBe(second.batchId);
    expect(third.batchId).not.toBe(first.batchId);
  });

  it("帳號刪掉之後紀錄還在：要留到保留期才看得出是誰做的", async () => {
    const [user] = await getDb().insert(coreUsers).values({ username: "bob", passwordHash: "scrypt$unused" }).returning();
    await writeAudit({ id: user.id, name: "bob", ip: "203.0.113.7" }, [{ module: "auth", action: "刪除帳號" }], NOW);

    await getDb().delete(coreUsers).where(eq(coreUsers.id, user.id));

    expect((await rows())[0]).toMatchObject({ actorId: user.id, actorName: "bob" });
  });
});

describe("失敗合併：外人能無限觸發的事不能一次寫一列", () => {
  const FAILURE = { module: "auth", action: "登入失敗", target: "alice" };

  it("同一小時、同一個帳號、同一個 IP 併成一列算次數，時間是最後一次", async () => {
    await writeMergedFailure(GUEST, FAILURE, NOW);
    await writeMergedFailure(GUEST, FAILURE, new Date("2026-11-04T02:40:00Z"));

    const all = await rows();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ attempts: 2, outcome: "failure", createdAt: new Date("2026-11-04T02:40:00Z") });
  });

  it("換 IP、換帳號、過了整點各自一列：才看得出是誰在試", async () => {
    await writeMergedFailure(GUEST, FAILURE, NOW);
    await writeMergedFailure({ ...GUEST, ip: "198.51.100.9" }, FAILURE, NOW);
    await writeMergedFailure(GUEST, { ...FAILURE, target: "bob" }, NOW);
    await writeMergedFailure(GUEST, FAILURE, new Date("2026-11-04T03:00:00Z"));

    expect(await rows()).toHaveLength(4);
  });

  it("換 IP 一直打：一小時的列數有上限，多的併成一列，資料表不會被灌滿", async () => {
    for (let i = 0; i < MERGED_ROWS_PER_HOUR + 5; i++) await writeMergedFailure({ ...GUEST, ip: `10.0.0.${i}` }, FAILURE, NOW);

    const all = await rows();
    expect(all).toHaveLength(MERGED_ROWS_PER_HOUR + 1);
    expect(all.at(-1)).toMatchObject({ attempts: 5, ip: "多個 IP", target: null });
  });

  it("帳號存在才寫帳號名稱；不存在的不存原文，有人會把密碼打進帳號欄", async () => {
    await getDb().insert(coreUsers).values({ username: "alice", passwordHash: "scrypt$unused" });

    await writeLoginFailure(GUEST, "alice", NOW);
    await writeLoginFailure(GUEST, "my-secret-password", NOW);

    const all = await rows();
    expect(all.map((row) => row.target)).toEqual(["alice", UNKNOWN_ACCOUNT]);
    expect(JSON.stringify(all)).not.toContain("my-secret-password");
  });
});

describe("保留期", () => {
  it("使用者要求的 7 天：超過的刪掉，剛好 7 天內的留著", async () => {
    const at = (days: number) => new Date(NOW.getTime() - days * 86_400_000);
    await writeAudit(ACTOR, [{ module: "auth", action: "八天前" }], at(8));
    await writeAudit(ACTOR, [{ module: "auth", action: "六天前" }], at(6));

    expect(await cleanupAudit(NOW)).toBe("刪除 1 筆超過 7 天的操作紀錄");
    expect((await rows()).map((row) => row.action)).toEqual(["六天前"]);
  });
});
