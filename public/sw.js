// 只處理推播 不快取也不接 fetch 換人登入時才不會看到上一個人的資料

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

function readMessage(event) {
  try {
    return event.data.json();
  } catch {
    return { title: "AllHub 有新通知" };
  }
}

// iPhone 規定每個推播都要顯示 不能略過 tag 跟頁面的系統通知一樣 同一則不會跳兩次
self.addEventListener("push", (event) => {
  const { id, title, body, url } = readMessage(event);
  event.waitUntil(self.registration.showNotification(title, { body, tag: id ? `allhub-notification-${id}` : undefined, icon: "/icons/app/192.png", data: { url } }));
});

async function openTarget(url) {
  const target = new URL(url ?? "/", self.location.origin);
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const open = windows.find((client) => new URL(client.url).origin === self.location.origin);
  if (!open || target.origin !== self.location.origin) return self.clients.openWindow(target.href);
  await open.focus();
  return open.navigate(target.href);
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(openTarget(event.notification.data?.url));
});
