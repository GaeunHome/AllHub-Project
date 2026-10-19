import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeFetch } from "@/dev/fake-fetch";
import { stubTwitchEnv } from "@/dev/test-env";
import { form, mocksOf } from "@/dev/test-helpers";

// 不換掉 service 與 lib 從 Server Action 一路走到向 Twitch 換 token
vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("@/core/cooldown", { spy: true });

stubTwitchEnv();

const { takeCooldown } = mocksOf(await import("@/core/cooldown"), "takeCooldown");
const { addStreamerAction, syncAction } = await import("./actions");

// Twitch 實際的回應 Client ID 不存在是 400 Client ID 對但 Secret 錯是 403
const tokenRejected = (status: number, body: string) =>
  fakeFetch(({ url }) => (url.includes("/oauth2/token") ? new Response(body, { status, headers: { "Content-Type": "application/json" } }) : Response.json({ data: [] })));

beforeEach(() => {
  takeCooldown.mockReset().mockResolvedValue(0);
});

describe("Twitch 應用程式的憑證填錯：表單直接說是哪個值不對、要改哪個環境變數", () => {
  it("加主播時 Twitch 回 400 invalid client_說 Client ID 不對", async () => {
    vi.stubGlobal("fetch", tokenRejected(400, '{"status":400,"message":"invalid client"}').impl);

    const { error } = await addStreamerAction({}, form({ login: "alice" }));

    expect(error).toContain("Client ID 不對");
    expect(error).toContain("TWITCH_CLIENT_ID");
    expect(error).not.toContain("TWITCH_CLIENT_SECRET");
  });

  it("同步訂閱時 Twitch 回 403 invalid client secret_說 Client Secret 不對", async () => {
    vi.stubGlobal("fetch", tokenRejected(403, '{"status":403,"message":"invalid client secret"}').impl);

    const { error } = await syncAction();

    expect(error).toContain("Client Secret 不對");
    expect(error).toContain("TWITCH_CLIENT_SECRET");
    expect(error).not.toContain("TWITCH_CLIENT_ID");
  });
});
