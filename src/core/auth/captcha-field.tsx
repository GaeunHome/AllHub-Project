"use client";

import { useId, useState } from "react";
import { Icon } from "../ui/icon";
import { CAPTCHA_FIELD } from "./messages";

/** src 由伺服器算繪頁面時給（帶時間參數）；每次送出表單（resetSignal 換了）或按「換一張」都重新載入，伺服器會一起換掉 cookie */
export function CaptchaField({ src, resetSignal, hiddenLabel = false }: { src: string; resetSignal: unknown; hiddenLabel?: boolean }) {
  const id = useId();
  const [version, setVersion] = useState(0);
  const [seenSignal, setSeenSignal] = useState(resetSignal);
  // 送出後伺服器已經清掉這張驗證碼的 cookie（不論對錯），在算繪時就換新的圖，不必等 effect
  if (seenSignal !== resetSignal) {
    setSeenSignal(resetSignal);
    setVersion((current) => current + 1);
  }
  const imageSrc = version === 0 ? src : `${src}&r=${version}`;

  return (
    <div className="field">
      <label htmlFor={id} className={hiddenLabel ? "sr-only" : "field-label"}>
        驗證碼
      </label>
      <div className="flex items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element -- 每次都要向伺服器拿新的圖與 cookie，不能經 next/image 最佳化或快取 */}
        <img src={imageSrc} alt="驗證碼圖片" width={170} height={60} className="h-[60px] w-[170px] shrink-0 rounded-xl" />
        <button type="button" onClick={() => setVersion((current) => current + 1)} className="btn-secondary">
          <Icon name="refresh-cw" className="size-4" />
          換一張
        </button>
      </div>
      {/* 換圖時一起清掉剛才打的字 */}
      <input
        key={version}
        id={id}
        name={CAPTCHA_FIELD}
        required
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        maxLength={10}
        placeholder={hiddenLabel ? "驗證碼" : undefined}
        className="input"
      />
    </div>
  );
}
