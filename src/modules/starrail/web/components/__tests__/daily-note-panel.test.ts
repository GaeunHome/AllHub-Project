import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { markup } from "@/dev/test-helpers";
import { mocksOf } from "@/dev/test-helpers";
import type { DailyNote } from "../../../lib/responses";
import { accountView } from "../../../dev/fixtures";

vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("../../../service/cached", { spy: true });

const cached = mocksOf(await import("../../../service/cached"), "cachedDailyNote");
const { DailyNotePanel } = await import("../daily-note-panel");

const NOTE: DailyNote = {
  stamina: 231,
  maxStamina: 300,
  staminaRecoverSeconds: 22_080,
  reserveStamina: 1200,
  expeditionsAccepted: 1,
  expeditionsTotal: 4,
  trainScore: 300,
  maxTrainScore: 500,
  rogueScore: 8000,
  maxRogueScore: 14000,
  cocoonRemaining: 2,
  cocoonLimit: 3,
};
const EXPEDITION = { name: "看不見的手", status: "ongoing" as const, remainingSeconds: 15_120, avatars: [], reward: "https://act-webstatic.hoyoverse.com/item/1.png" };
const html = async () => markup((await DailyNotePanel({ account: accountView() })) as ReactElement);

beforeEach(() => {
  cached.cachedDailyNote.mockReset().mockResolvedValue({ ok: true, note: NOTE, expeditions: [EXPEDITION], fetchedAt: new Date(), cookieInvalid: false });
});

describe("即時便箋（使用者要的：好看一點）", () => {
  it("開拓力畫成圓環：231/300 是 77%", async () => {
    expect(await html()).toMatch(/<circle[^>]*class="sr-ring-value"[^>]*stroke-dasharray="77 100"/);
  });

  it("委託旁邊放獎勵的圖示（HoYoLAB 沒給總時長，畫不出準確的進度，改放獎勵）", async () => {
    expect(await html()).toContain("https://act-webstatic.hoyoverse.com/item/1.png");
  });
});
