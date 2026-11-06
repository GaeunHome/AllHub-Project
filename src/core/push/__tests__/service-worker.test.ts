import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

// public/sw.js 是瀏覽器直接載入的檔 用假的 self 跑一次
const source = readFileSync(new URL("../../../../public/sw.js", import.meta.url), "utf8");

type Listener = (event: { data?: unknown; notification?: unknown; waitUntil: (work: Promise<unknown>) => void }) => void;

function load(windows: { url: string; focus: () => Promise<void>; navigate: (url: string) => Promise<void> }[] = []) {
  const listeners = new Map<string, Listener>();
  const self = {
    location: { origin: "https://hub.example.com" },
    addEventListener: (name: string, listener: Listener) => listeners.set(name, listener),
    registration: { showNotification: vi.fn(async () => {}) },
    clients: { matchAll: vi.fn(async () => windows), openWindow: vi.fn(async () => {}), claim: vi.fn() },
    skipWaiting: vi.fn(),
  };
  new Function("self", source)(self);
  const run = async (name: string, event: object) => {
    const work: Promise<unknown>[] = [];
    listeners.get(name)!({ ...event, waitUntil: (promise) => work.push(promise) });
    await Promise.all(work);
  };
  return { self, run };
}

const clicked = (url?: string) => ({ notification: { close: vi.fn(), data: { url } } });

describe("手機收到推播", () => {
  it("tag 跟頁面的系統通知一樣 同一則不會跳兩次", async () => {
    const { self, run } = load();

    await run("push", { data: { json: () => ({ id: 7, title: "開台了", body: "小明", url: "/twitch" }) } });

    expect(self.registration.showNotification).toHaveBeenCalledWith("開台了", expect.objectContaining({ body: "小明", tag: "allhub-notification-7", data: { url: "/twitch" } }));
  });

  it("內容讀不出來也要顯示 iPhone 規定每個推播都要有通知", async () => {
    const { self, run } = load();

    await run("push", { data: { json: () => { throw new SyntaxError("bad"); } } });
    await run("push", { data: null });

    expect(self.registration.showNotification).toHaveBeenCalledTimes(2);
  });
});

describe("點通知", () => {
  beforeEach(() => vi.clearAllMocks());

  it("網站開著：回到那個畫面並換到通知的頁面", async () => {
    const page = { url: "https://hub.example.com/weather", focus: vi.fn(async () => {}), navigate: vi.fn(async () => {}) };
    const { self, run } = load([page]);

    await run("notificationclick", clicked("/twitch"));

    expect(page.focus).toHaveBeenCalled();
    expect(page.navigate).toHaveBeenCalledWith("https://hub.example.com/twitch");
    expect(self.clients.openWindow).not.toHaveBeenCalled();
  });

  it("網站關著：打開通知的頁面 沒有網址回首頁", async () => {
    const { self, run } = load();

    await run("notificationclick", clicked());

    expect(self.clients.openWindow).toHaveBeenCalledWith("https://hub.example.com/");
  });

  it("連到外面的通知：另外開 不蓋掉開著的網站", async () => {
    const page = { url: "https://hub.example.com/", focus: vi.fn(async () => {}), navigate: vi.fn(async () => {}) };
    const { self, run } = load([page]);

    await run("notificationclick", clicked("https://www.twitch.tv/alice"));

    expect(self.clients.openWindow).toHaveBeenCalledWith("https://www.twitch.tv/alice");
    expect(page.navigate).not.toHaveBeenCalled();
  });
});
