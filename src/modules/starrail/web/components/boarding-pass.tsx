"use client";

import { useState, type ReactNode } from "react";
import { formatTaipeiMonthDay } from "@/core/time";
import { Icon } from "@/core/ui/icon";

// 使用者選的 連結帳號的視窗是星穹列車的乘車證 左邊票根 右邊表單 圖都用 CSS 自己畫

type BoardingPassProps = { titleId: string; onClose: () => void; children: ReactNode };

/** 視窗不畫標題列 票根 標題與關閉鈕都在這裡 */
export function BoardingPass({ titleId, onClose, children }: BoardingPassProps) {
  // 視窗打開時才算繪 只在瀏覽器裡讀今天
  const [today] = useState(() => formatTaipeiMonthDay(new Date()));
  return (
    <div className="sr-pass">
      {/* 票根只是裝飾 報讀器不念 */}
      <div className="sr-pass-stub" aria-hidden>
        <span className="sr-pass-emblem">
          <Icon name="train-front" className="size-6" />
        </span>
        <span className="sr-pass-line">星穹列車</span>
        <span className="sr-pass-date">
          <span>乘車日</span>
          <span className="sr-num">{today}</span>
        </span>
      </div>
      <div className="sr-pass-main">
        <div className="sr-pass-header">
          <div className="min-w-0">
            <p className="sr-pass-kicker">乘車登記</p>
            <h2 id={titleId} className="text-lg font-semibold text-ink">
              連結 HoYoLAB 帳號
            </h2>
          </div>
          <button type="button" onClick={onClose} aria-label="關閉" className="btn-ghost btn-sm btn-icon">
            <Icon name="x" className="size-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const STATIONS = ["帳號", "驗證", "伺服器"] as const;

/** 登入走到哪一站 1 填帳號密碼 2 圖形或 email 驗證 3 選伺服器 */
export function PassTrack({ current }: { current: 1 | 2 | 3 }) {
  return (
    <ol className="sr-pass-track" aria-label="連結的步驟">
      {STATIONS.map((station, index) => {
        const step = index + 1;
        const state = step < current ? "done" : step === current ? "current" : "todo";
        return (
          <li key={station} data-state={state} aria-current={state === "current" ? "step" : undefined}>
            <span className="sr-pass-stop" />
            {station}
          </li>
        );
      })}
    </ol>
  );
}
