"use client";

import { useState, type ComponentProps } from "react";
import { Icon } from "./icon";

/** 顯示與隱藏時輸入框與按鈕的屬性；拆成純函式，不靠瀏覽器也能測 */
export function passwordToggle(visible: boolean) {
  return visible ? ({ type: "text", label: "隱藏密碼", icon: "eye-off" } as const) : ({ type: "password", label: "顯示密碼", icon: "eye" } as const);
}

/** 密碼欄位右邊的眼睛按鈕切換明碼；預設隱藏，autocomplete 等屬性照呼叫端給的。外面用 label 的 htmlFor 對應 id，不要用 label 包住（裡面有按鈕） */
export function PasswordInput({ className = "input", ...props }: Omit<ComponentProps<"input">, "type">) {
  const [visible, setVisible] = useState(false);
  const toggle = passwordToggle(visible);

  return (
    <span className="relative block">
      <input {...props} type={toggle.type} className={`${className} pr-12`} />
      {/* type="button"：在表單裡按下去不會送出；佔滿輸入框右端的 44×44，手指也點得到 */}
      <button
        type="button"
        aria-label={toggle.label}
        aria-pressed={visible}
        title={toggle.label}
        onClick={() => setVisible((current) => !current)}
        className="absolute inset-y-0 right-0 grid w-11 cursor-pointer place-items-center rounded-r-lg text-ink-soft transition-colors hover:text-ink focus-visible:-outline-offset-2"
      >
        <Icon name={toggle.icon} className="size-4" />
      </button>
    </span>
  );
}
