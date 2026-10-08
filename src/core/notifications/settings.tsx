"use client";

import { useState, useSyncExternalStore } from "react";
import { Icon } from "../ui/icon";
import { chime } from "./chime";
import { ModuleBadge, type NotificationModule } from "./notification-summary";
import { setAlertPref, useAlertPref, useAnyAlertPref } from "./prefs";
import { permissionNotice, shouldRequestPermission, type PermissionNotice, type PermissionState } from "./system-notification";

const permissionListeners = new Set<() => void>();

function readPermission(): PermissionState {
  return "Notification" in window ? Notification.permission : "unsupported";
}

function subscribePermission(listener: () => void): () => void {
  permissionListeners.add(listener);
  // 使用者在瀏覽器的網站設定改了權限，回到這一頁時重新讀
  window.addEventListener("focus", listener);
  return () => {
    permissionListeners.delete(listener);
    window.removeEventListener("focus", listener);
  };
}

/** 伺服器算繪時不知道權限，回 null 先不顯示按鈕，避免閃一下錯的狀態 */
function useNotificationPermission(): PermissionState | null {
  return useSyncExternalStore(subscribePermission, readPermission, () => null);
}

async function requestPermission(): Promise<void> {
  await Notification.requestPermission();
  permissionListeners.forEach((listener) => listener());
}

const PERMISSION_TEXT: Record<PermissionState, string> = {
  default: "還沒允許。按下面的按鈕後，瀏覽器會詢問要不要允許通知。",
  granted: "已允許。網站在背景分頁時，開著瀏覽器通知的模組有新通知會跳出系統通知，點一下會回到這個分頁。",
  denied: "已被封鎖。要用的話請到瀏覽器的網站設定，把這個網站的通知改成允許。",
  unsupported: "這個瀏覽器不支援系統通知（iPhone 要先把網站加到主畫面）。",
};

const NOTICE_TEXT: Record<PermissionNotice, string> = {
  request: "瀏覽器還沒允許通知，背景時跳不出系統通知。",
  denied: "瀏覽器封鎖了這個網站的通知，背景時跳不出系統通知。要用的話請到瀏覽器的網站設定改成允許。",
  unsupported: "這個瀏覽器不支援系統通知（iPhone 要先把網站加到主畫面），只會有提示卡片與提示音。",
};

/** 每個模組一列、提示音與瀏覽器通知各一個開關；模組清單由 src/app 傳進來，新增模組會自動出現 */
export function AlertSwitchTable({ modules }: { modules: NotificationModule[] }) {
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="text-xs text-muted">
          <th scope="col" className="pb-1.5 text-left font-medium">
            模組
          </th>
          <th scope="col" className="w-[4.75rem] pb-1.5 text-center font-medium">
            提示音
          </th>
          <th scope="col" className="w-[4.75rem] pb-1.5 text-center font-medium">
            瀏覽器通知
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {modules
          .filter((module) => module.notifies !== false)
          .map((module) => (
            <AlertSwitchRow key={module.id} module={module} />
          ))}
      </tbody>
    </table>
  );
}

function AlertSwitchRow({ module }: { module: NotificationModule }) {
  const sound = useAlertPref(module.id, "sound");
  const browser = useAlertPref(module.id, "browser");

  return (
    <tr>
      <th scope="row" className="py-2 pr-2 text-left font-medium text-ink">
        <span className="flex min-w-0 items-center gap-2.5">
          <ModuleBadge module={module} className="size-8" />
          <span className="truncate">{module.name}</span>
        </span>
      </th>
      <td className="py-2 text-center">
        <input
          type="checkbox"
          role="switch"
          aria-label={`${module.name}：提示音`}
          checked={sound}
          onChange={(event) => {
            setAlertPref(module.id, "sound", event.target.checked);
            // 這次點擊本身就算互動，順便把音效準備好
            chime.unlock();
          }}
          className="switch align-middle"
        />
      </td>
      <td className="py-2 text-center">
        <input
          type="checkbox"
          role="switch"
          aria-label={`${module.name}：瀏覽器通知`}
          checked={browser}
          onChange={(event) => {
            const enabled = event.target.checked;
            setAlertPref(module.id, "browser", enabled);
            if (shouldRequestPermission(readPermission(), enabled)) void requestPermission();
          }}
          className="switch align-middle"
        />
      </td>
    </tr>
  );
}

/** 有模組開著瀏覽器通知、權限卻還沒拿到時的提示；被拒絕後也會留著，提醒要到瀏覽器的網站設定改 */
export function BrowserPermissionNotice({ moduleIds }: { moduleIds: string[] }) {
  const notice = permissionNotice(useNotificationPermission(), useAnyAlertPref(moduleIds, "browser"));
  if (!notice) return null;

  return (
    <div role="status" className="notice flex-wrap items-center px-3 text-xs">
      <Icon name="circle-alert" />
      <span className="min-w-40 flex-1">{NOTICE_TEXT[notice]}</span>
      {notice === "request" && (
        <button type="button" onClick={requestPermission} className="btn-secondary btn-sm">
          <Icon name="bell-ring" className="size-3.5" />
          允許
        </button>
      )}
    </div>
  );
}

/** 通知頁的「提醒方式」：模組開關跟鈴鐺面板的是同一份設定，另外有試聽、權限與測試通知 */
export function NotificationSettings({ modules }: { modules: NotificationModule[] }) {
  const moduleIds = modules.map((m) => m.id);
  const anySound = useAnyAlertPref(moduleIds, "sound");
  const permission = useNotificationPermission();
  const [soundHint, setSoundHint] = useState<string | null>(null);
  const [browserHint, setBrowserHint] = useState<string | null>(null);

  async function preview() {
    setSoundHint((await chime.preview()) ? null : "播放失敗：這個瀏覽器可能不支援 Web Audio，或系統已靜音。");
  }

  function sendTest() {
    try {
      new Notification("AllHub 測試通知", { body: "看到這則就代表系統通知設定好了", tag: "allhub-test", icon: "/favicon.ico" });
      setBrowserHint(null);
    } catch {
      // Android 的 Chrome 只允許 Service Worker 顯示系統通知
      setBrowserHint("這個瀏覽器不能直接跳出系統通知（例如 Android 的 Chrome），右下角的提示卡片與提示音仍會照常提醒。");
    }
  }

  return (
    <div className="card flex flex-col divide-y divide-line p-0">
      <div className="flex flex-col gap-3 px-5 py-5 sm:px-6">
        <p className="text-sm leading-relaxed text-muted">
          每個模組分開設定，存在這台裝置的瀏覽器，每台裝置可以不同。兩個都關的模組不跳提示卡片，只算進未讀數字；未讀數字一律照常顯示。
        </p>
        <AlertSwitchTable modules={modules} />
      </div>

      <div className="flex flex-col gap-3 px-5 py-5 sm:px-6">
        <div className="flex items-start gap-3">
          <span className="icon-tile size-10 rounded-xl">
            <Icon name={anySound ? "volume-2" : "volume-x"} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-ink">提示音</p>
            <p className="mt-0.5 text-sm leading-relaxed text-muted">開著提示音的模組有新通知時，播一聲輕柔的提示音。瀏覽器規定要先在頁面上點過任何地方，才能播放聲音。</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:pl-13">
          <button type="button" onClick={preview} className="btn-secondary btn-sm">
            <Icon name="play" className="size-3.5" />
            試聽
          </button>
          {soundHint && <span className="text-xs text-danger">{soundHint}</span>}
        </div>
      </div>

      <div className="flex flex-col gap-3 px-5 py-5 sm:px-6">
        <div className="flex items-start gap-3">
          <span className="icon-tile size-10 rounded-xl">
            <Icon name="bell-ring" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-ink">
              瀏覽器通知 <span className="chip ml-1 align-middle">選用</span>
            </p>
            <p className="mt-0.5 text-sm leading-relaxed text-muted">{permission ? PERMISSION_TEXT[permission] : "讀取中…"}</p>
          </div>
        </div>
        {(permission === "default" || permission === "granted") && (
          <div className="flex flex-wrap items-center gap-2 sm:pl-13">
            {permission === "default" ? (
              <button type="button" onClick={requestPermission} className="btn-primary btn-sm">
                <Icon name="bell-ring" className="size-3.5" />
                允許瀏覽器通知
              </button>
            ) : (
              <button type="button" onClick={sendTest} className="btn-secondary btn-sm">
                <Icon name="bell" className="size-3.5" />
                傳送測試通知
              </button>
            )}
            {browserHint && <span className="text-xs text-danger">{browserHint}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
