import { refresh, revalidateTag } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { form, mocksOf, updated } from "@/dev/test-helpers";

vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("../../service/settings", { spy: true });
vi.mock("../../service/places", { spy: true });

const settings = mocksOf(await import("../../service/settings"), "saveSettings");
const places = mocksOf(await import("../../service/places"), "movePlace");
const { movePlaceAction, saveSettingsAction } = await import("../actions");

beforeEach(() => {
  settings.saveSettings.mockReset().mockResolvedValue("高雄市");
  places.movePlace.mockReset().mockResolvedValue(true);
});

describe("天氣的 Server Action：寫入後用 updateTag 讓對應的 tag 失效", () => {
  it.each([["saveSettingsAction", ["weather:settings"], () => saveSettingsAction({}, form({ county: "高雄市", rainAlert: "true" }))]] as const)("%s_%j", async (_name, tags, run) => {
    await run();

    expect(updated()).toEqual([...tags].sort());
    expect(revalidateTag).not.toHaveBeenCalled();
    // updateTag 已經會讓這次回應帶著重新算繪的頁面 再呼叫 refresh 是多餘的
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("拖曳城市", () => {
  it("順序真的改了_讓城市清單失效", async () => {
    await movePlaceAction(3, 1);

    expect(updated()).toEqual(["weather:places"]);
  });

  it("放回原位_不失效", async () => {
    places.movePlace.mockResolvedValue(false);

    await movePlaceAction(3, 1);

    expect(updated()).toEqual([]);
  });

  it("參數被改過_不碰資料庫", async () => {
    expect(await movePlaceAction(Number.NaN, null)).toHaveProperty("error");
    expect(await movePlaceAction(1, 1.5)).toHaveProperty("error");
    expect(places.movePlace).not.toHaveBeenCalled();
  });
});
