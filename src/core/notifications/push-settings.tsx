"use client";

import { useEffect, useState } from "react";
import { useClientValue } from "../ui/client-value";
import { Icon } from "../ui/icon";
import { InfoTip } from "../ui/info-tip";
import { useToast } from "../ui/toast";
import { ModuleBadge, type NotificationModule } from "./notification-summary";
import { disablePush, enablePush, pushSupport, setPushMuted, syncPush } from "./push-client";

const FAILED = "手機通知設定失敗，稍後再試";

const SUPPORT_TEXT = {
  install: "iPhone 要先用 Safari 的分享選單「加入主畫面」，再從主畫面打開這一頁。",
  unsupported: "這個瀏覽器不支援手機通知。",
};

/** 每支手機分開設定 存在伺服器 手機關著也要知道哪些模組不用送 */
export function PushSettings({ publicKey, modules }: { publicKey: string; modules: NotificationModule[] }) {
  const toast = useToast();
  const support = useClientValue(pushSupport, null);
  // null 是這支手機還沒開啟
  const [muted, setMuted] = useState<string[] | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (support !== "ready") return;
    syncPush()
      .then(setMuted)
      .catch(() => setMuted(null));
  }, [support]);

  async function run(work: () => Promise<void>) {
    setPending(true);
    try {
      await work();
    } catch {
      toast.error(FAILED);
    } finally {
      setPending(false);
    }
  }

  const turnOn = () =>
    run(async () => {
      const result = await enablePush(publicKey);
      if (result) setMuted(result);
      else toast.warning("瀏覽器沒有允許通知，請到手機的設定打開");
    });

  const turnOff = () =>
    run(async () => {
      await disablePush();
      setMuted(null);
    });

  const toggle = (id: string, on: boolean) =>
    run(async () => {
      await setPushMuted(id, !on);
      setMuted((current) => (on ? (current ?? []).filter((moduleId) => moduleId !== id) : [...(current ?? []), id]));
    });

  return (
    <div className="card-row stack">
      <div className="flex items-center gap-3">
        <span className="icon-tile size-9 rounded-xl">
          <Icon name="smartphone" />
        </span>
        <p className="flex min-w-0 flex-1 flex-wrap items-center gap-2 font-semibold text-ink">
          手機通知
          <InfoTip label="手機通知">網站關掉也收得到，鎖定畫面不顯示理財的金額</InfoTip>
          {muted && <span className="chip chip-success">這支手機已開啟</span>}
        </p>
      </div>
      {support && support !== "ready" && <p className="text-ink">{SUPPORT_TEXT[support]}</p>}
      {support === "ready" &&
        (muted ? (
          <>
            <ul className="divide-y divide-line">
              {modules.map((module) => (
                <li key={module.id}>
                  <label className="flex min-h-11 cursor-pointer items-center gap-3 font-medium text-ink">
                    <ModuleBadge module={module} />
                    <span className="min-w-0 flex-1 truncate">{module.name}</span>
                    <input type="checkbox" role="switch" aria-label={`${module.name}：手機通知`} checked={!muted.includes(module.id)} disabled={pending} onChange={(event) => toggle(module.id, event.target.checked)} className="switch" />
                  </label>
                </li>
              ))}
            </ul>
            <button type="button" onClick={turnOff} disabled={pending} className="btn-secondary btn-sm self-start">
              關掉這支手機的通知
            </button>
          </>
        ) : (
          <button type="button" onClick={turnOn} disabled={pending} className="btn-primary btn-sm self-start">
            <Icon name="bell-ring" className="size-3.5" />
            在這支手機開啟
          </button>
        ))}
    </div>
  );
}
