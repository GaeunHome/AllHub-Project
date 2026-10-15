"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { monthHref, type MonthBasePath } from "./month-href";

/** 用 key 重新掛載而不是受控 換頁還沒完成時選單才不會跳回舊值 */
export function MonthSelect({ value, options, basePath }: { value: string; options: { value: string; label: string }[]; basePath: MonthBasePath }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <select
      key={value}
      aria-label="選擇月份"
      defaultValue={value}
      disabled={pending}
      onChange={(e) => {
        const month = e.target.value;
        startTransition(() => router.push(monthHref(month, basePath), { scroll: false }));
      }}
      className="input w-auto font-medium"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
