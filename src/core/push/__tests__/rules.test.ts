import { describe, expect, it } from "vitest";
import { isPushEndpoint, isPushKeys, pushSubject } from "../rules";

const P256DH = Buffer.alloc(65, 1).toString("base64url");
const AUTH = Buffer.alloc(16, 2).toString("base64url");

describe("isPushEndpoint：伺服器只送到真的推送服務，網址是瀏覽器送來的", () => {
  it.each([
    "https://fcm.googleapis.com/fcm/send/abc",
    "https://web.push.apple.com/QK-abc",
    "https://updates.push.services.mozilla.com/wpush/v2/abc",
    "https://wns2-par02p.notify.windows.com/w/?token=abc",
  ])("%s：收", (endpoint) => {
    expect(isPushEndpoint(endpoint)).toBe(true);
  });

  it.each([
    ["雲端的中繼資料位址", "http://169.254.169.254/latest/meta-data"],
    ["本機", "https://localhost/secret"],
    ["不是 https", "http://fcm.googleapis.com/fcm/send/abc"],
    ["前綴騙人的網域", "https://fcm.googleapis.com.evil.example/x"],
    ["帶帳號密碼騙網域", "https://fcm.googleapis.com@evil.example/x"],
    ["換 port", "https://fcm.googleapis.com:8443/x"],
    ["不是網址", "abc"],
    ["太長", `https://fcm.googleapis.com/${"a".repeat(2000)}`],
  ])("%s：不收", (_name, endpoint) => {
    expect(isPushEndpoint(endpoint)).toBe(false);
  });
});

describe("isPushKeys：長度不對的金鑰加密時會丟錯", () => {
  it("65 bytes 加 16 bytes：收", () => {
    expect(isPushKeys({ p256dh: P256DH, auth: AUTH })).toBe(true);
  });

  it.each([
    ["p256dh 太短", { p256dh: "AAAA", auth: AUTH }],
    ["auth 太短", { p256dh: P256DH, auth: "AAAA" }],
    ["不是 base64url", { p256dh: "!".repeat(87), auth: AUTH }],
  ])("%s：不收", (_name, keys) => {
    expect(isPushKeys(keys)).toBe(false);
  });
});

describe("pushSubject：web-push 只收 https 的寄件人", () => {
  it("正式環境用網站的網址", () => {
    expect(pushSubject("https://allhub-project.vercel.app")).toBe("https://allhub-project.vercel.app");
  });

  it("本機的 http 或沒設定：換成收得下的佔位 不然每一則都送不出去", () => {
    expect(pushSubject("http://localhost:3000")).toMatch(/^https:/);
    expect(pushSubject(undefined)).toMatch(/^https:/);
  });
});
