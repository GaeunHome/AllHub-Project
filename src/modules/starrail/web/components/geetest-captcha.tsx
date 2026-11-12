"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Icon } from "@/core/ui/icon";
import { GEETEST_API_SERVER } from "../../lib/geetest";
import type { GeetestChallenge } from "../actions";

type GeetestValidate = Record<string, string>;

type GeetestInstance = {
  appendTo: (target: HTMLElement) => void;
  onSuccess: (callback: () => void) => void;
  onError: (callback: () => void) => void;
  getValidate: () => GeetestValidate | false;
  destroy?: () => void;
};

type GeetestConfig = {
  captchaId: string;
  riskType: string;
  userInfo: string;
  apiServers: string[];
  product: "float";
  language: string;
};

declare global {
  interface Window {
    initGeetest4?: (config: GeetestConfig, ready: (captcha: GeetestInstance) => void) => void;
  }
}

/** 伺服器組 x-rpc-aigis 要 session id 與 captcha_id v4 的結果不一定帶 captcha_id */
export function geetestPayload(challenge: GeetestChallenge, validate: GeetestValidate): string {
  return JSON.stringify({ sessionId: challenge.sessionId, captcha_id: challenge.captchaId, ...validate });
}

// 同一頁只載入一次 失敗時下一次重新載入
let loading: Promise<void> | null = null;

function loadScript(src: string): Promise<void> {
  loading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      script.remove();
      loading = null;
      reject(new Error("Geetest 載入失敗"));
    };
    document.head.append(script);
  });
  return loading;
}

type Props = { challenge: GeetestChallenge; onPass: (payload: string) => void };

/**
 * 外部的程式只在 HoYoverse 要求驗證時才載入
 * 用 float 畫在視窗裡的框 modal 視窗外面的東西點不到
 */
export function GeetestCaptcha({ challenge, onPass }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const pass = useEffectEvent(onPass);

  useEffect(() => {
    let cancelled = false;
    let instance: GeetestInstance | undefined;
    loadScript(challenge.script)
      .then(() => {
        if (cancelled) return;
        if (!window.initGeetest4 || !box.current) throw new Error("Geetest 沒有初始化");
        window.initGeetest4(
          {
            captchaId: challenge.captchaId,
            riskType: challenge.riskType,
            userInfo: JSON.stringify({ session_id: challenge.sessionId }),
            apiServers: [GEETEST_API_SERVER],
            product: "float",
            language: "zho-tw",
          },
          (captcha) => {
            if (cancelled || !box.current) return captcha.destroy?.();
            instance = captcha;
            captcha.appendTo(box.current);
            captcha.onSuccess(() => {
              const validate = captcha.getValidate();
              if (validate) pass(geetestPayload(challenge, validate));
            });
            captcha.onError(() => setFailed(true));
          },
        );
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      instance?.destroy?.();
    };
  }, [challenge]);

  if (failed) {
    return (
      <p className="notice">
        <Icon name="circle-alert" />
        圖形驗證暫時無法讀取，請改用「貼上 cookie」連結。
      </p>
    );
  }
  return <div ref={box} className="min-h-11" />;
}
