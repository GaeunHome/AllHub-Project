// 訂閱的網址是瀏覽器送來的 伺服器會照著送 POST
// 只收真的推送服務 不然有人能拿網站去打內部的位址

export const PUSH_DEVICE_LIMIT = 5;

const ENDPOINT_MAX = 1000;
const PUSH_HOSTS = ["fcm.googleapis.com", "web.push.apple.com", "updates.push.services.mozilla.com"];
const PUSH_HOST_SUFFIXES = [".push.apple.com", ".push.services.mozilla.com", ".notify.windows.com"];
const P256DH_BYTES = 65;
const AUTH_BYTES = 16;
// web-push 的寄件人只收 https 本機的 http 改用這個 本機不會真的送到推送服務
const LOCAL_SUBJECT = "https://allhub.invalid";

export function isPushEndpoint(value: string): boolean {
  if (value.length > ENDPOINT_MAX || !URL.canParse(value)) return false;
  const { protocol, port, username, password, hostname } = new URL(value);
  if (protocol !== "https:" || port || username || password) return false;
  return PUSH_HOSTS.includes(hostname) || PUSH_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix));
}

const bytesOf = (value: string) => (/^[\w-]+={0,2}$/.test(value) ? Buffer.from(value, "base64url").length : 0);

export const isPushKeys = ({ p256dh, auth }: { p256dh: string; auth: string }) => bytesOf(p256dh) === P256DH_BYTES && bytesOf(auth) === AUTH_BYTES;

export const pushSubject = (baseUrl: string | undefined) => (baseUrl?.startsWith("https://") ? baseUrl : LOCAL_SUBJECT);
