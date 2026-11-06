import { describe, expect, it, vi } from "vitest";
import { leaveThisPhone, pushSupport } from "../push-client";

const fakeBrowser = (userAgent: string, capable: boolean) => {
  vi.stubGlobal("navigator", { userAgent, ...(capable ? { serviceWorker: {} } : {}) });
  vi.stubGlobal("window", capable ? { PushManager: class {}, Notification: class {} } : {});
};

describe("pushSupport：畫面要說明下一步", () => {
  it("還沒加到主畫面的 iPhone：請他先加到主畫面", () => {
    fakeBrowser("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", false);

    expect(pushSupport()).toBe("install");
  });

  it("從主畫面打開的 iPhone 與 Android 的 Chrome：可以開", () => {
    fakeBrowser("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", true);
    expect(pushSupport()).toBe("ready");

    fakeBrowser("Mozilla/5.0 (Linux; Android 14) Chrome/130", true);
    expect(pushSupport()).toBe("ready");
  });

  it("其他不支援的瀏覽器：直接說不支援", () => {
    fakeBrowser("Mozilla/5.0 (X11; Linux x86_64)", false);

    expect(pushSupport()).toBe("unsupported");
  });
});

describe("leaveThisPhone：登出不能被卡住", () => {
  it("關通知失敗時照樣往下登出", async () => {
    vi.stubGlobal("navigator", { serviceWorker: { getRegistration: () => Promise.reject(new Error("壞了")) } });

    await expect(leaveThisPhone()).resolves.toBeUndefined();
  });
});
