"use client";

// 瀏覽器這邊的手機通知 訂閱資料交給 /api/push 伺服器照著推

const API = "/api/push";
const SERVICE_WORKER = "/sw.js";
// 登出不能被推送服務卡住 等不到就先登出 舊訂閱之後推不到會被刪掉
const LOGOUT_WAIT_MS = 3000;

export type PushSupport = "ready" | "install" | "unsupported";

/** iPhone 的 Safari 要加到主畫面再從主畫面打開才有推播 */
export function pushSupport(): PushSupport {
  if ("serviceWorker" in navigator && "PushManager" in window && "Notification" in window) return "ready";
  return /iPhone|iPad|iPod/.test(navigator.userAgent) ? "install" : "unsupported";
}

const send = (method: string, body: unknown) => fetch(API, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

async function currentSubscription(): Promise<PushSubscription | null> {
  if (!("serviceWorker" in navigator)) return null;
  const registration = await navigator.serviceWorker.getRegistration();
  return (await registration?.pushManager.getSubscription()) ?? null;
}

export const thisPhoneEndpoint = async () => (await currentSubscription())?.endpoint ?? null;

async function saveToServer(subscription: PushSubscription): Promise<string[]> {
  const { endpoint, keys } = subscription.toJSON();
  const response = await send("POST", { endpoint, keys });
  if (!response.ok) throw new Error(`手機通知設定失敗：${response.status}`);
  const { muted } = (await response.json()) as { muted: string[] };
  return muted;
}

/** 回傳這支手機關掉的模組 還沒開啟是 null 改過密碼被刪掉的也在這裡補回去 */
export async function syncPush(): Promise<string[] | null> {
  const subscription = await currentSubscription();
  return subscription && saveToServer(subscription);
}

const keyBytes = (publicKey: string) => Uint8Array.from(atob(publicKey.replaceAll("-", "+").replaceAll("_", "/")), (char) => char.charCodeAt(0));

/** 要在按鈕的點擊裡呼叫 瀏覽器才會跳出詢問 使用者不允許時回 null */
export async function enablePush(publicKey: string): Promise<string[] | null> {
  if ((await Notification.requestPermission()) !== "granted") return null;
  await navigator.serviceWorker.register(SERVICE_WORKER);
  const registration = await navigator.serviceWorker.ready;
  // 站長換過金鑰時舊的訂閱不能沿用
  await (await registration.pushManager.getSubscription())?.unsubscribe();
  return saveToServer(await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
}

export async function disablePush(): Promise<void> {
  const subscription = await currentSubscription();
  if (!subscription) return;
  await send("DELETE", { endpoint: subscription.endpoint });
  await subscription.unsubscribe();
}

export async function setPushMuted(moduleId: string, muted: boolean): Promise<void> {
  const endpoint = await thisPhoneEndpoint();
  const response = endpoint && (await send("PATCH", { endpoint, moduleId, muted }));
  if (!response || !response.ok) throw new Error("手機通知設定失敗");
}

/** 登出前呼叫 不然登出後這支手機還會收到前一個人的通知 失敗不擋登出 */
export async function leaveThisPhone(): Promise<void> {
  await Promise.race([disablePush().catch(() => {}), new Promise((resolve) => setTimeout(resolve, LOGOUT_WAIT_MS))]);
}
