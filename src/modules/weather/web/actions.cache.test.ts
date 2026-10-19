import { refresh, revalidateTag } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { form, mocksOf, updated } from "@/dev/test-helpers";

vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("../service/settings", { spy: true });

const settings = mocksOf(await import("../service/settings"), "saveSettings");
const { saveSettingsAction } = await import("./actions");

beforeEach(() => {
  settings.saveSettings.mockReset().mockResolvedValue("高雄市");
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
