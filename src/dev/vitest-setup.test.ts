import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { externalFetch } from "@/core/external-url";
import { fakeFetch } from "./fake-fetch";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const failureOf = (pending: Promise<unknown>) =>
  pending.then(
    () => {
      throw new Error("預期要被擋下");
    },
    (error: unknown) => (error instanceof Error ? error.message : String(error)),
  );

/** 本機的小伺服器，確認 localhost／127.0.0.1 照常連得到 */
async function withLocalServer(run: (port: number) => Promise<void>) {
  const server = createServer((_request, response) => response.end("ok"));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    await run((server.address() as AddressInfo).port);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

describe("測試防護：全域 fetch 只能連 localhost／127.0.0.1", () => {
  it("對外的網址_直接丟錯，訊息說明怎麼在測試裡換成替身", async () => {
    const message = await failureOf(fetch("https://api.twitch.tv/helix/users?login=alice"));

    expect(message).toContain("測試不能對外連線（https://api.twitch.tv）");
    expect(message).toContain("fakeFetch");
    expect(message).toContain("fetchImpl");
    expect(message).toContain('vi.stubGlobal("fetch"');
    expect(message).toContain("{ spy: true }");
  });

  it("用 URL 或 Request 物件指定目的地_一樣擋下", async () => {
    expect(await failureOf(fetch(new URL("https://www.youtube.com/watch?v=abcdefghijk")))).toContain("測試不能對外連線（https://www.youtube.com）");
    expect(await failureOf(fetch(new Request("https://pubsubhubbub.appspot.com/subscribe", { method: "POST" })))).toContain("測試不能對外連線");
  });

  it("vi.mock(path, { spy: true }) 沒設定回應而呼叫到真的實作時_經過 externalFetch 也會被擋下", async () => {
    vi.stubEnv("DEV_EXTERNAL_ORIGIN", "");

    expect(await failureOf(externalFetch("https://sg-public-api.hoyolab.com/event/luna/os/info"))).toContain("測試不能對外連線");
  });

  it("localhost 與 127.0.0.1_照常連線", async () => {
    await withLocalServer(async (port) => {
      expect(await (await fetch(`http://127.0.0.1:${port}/`)).text()).toBe("ok");
      expect(await (await fetch(`http://localhost:${port}/`)).text()).toBe("ok");
    });
  });

  it("測試自己用 vi.stubGlobal 換掉 fetch_照常用替身；還原之後又回到防護", async () => {
    const fake = fakeFetch(() => new Response("替身"));
    vi.stubGlobal("fetch", fake.impl);

    expect(await (await fetch("https://api.twitch.tv/helix/users")).text()).toBe("替身");
    expect(fake.urls).toEqual(["https://api.twitch.tv/helix/users"]);

    vi.unstubAllGlobals();
    expect(await failureOf(fetch("https://api.twitch.tv/helix/users"))).toContain("測試不能對外連線");
  });
});
