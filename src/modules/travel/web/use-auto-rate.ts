"use client";

import { useRef, useState } from "react";
import { formatTaipeiMonthDay } from "@/core/time";
import { HOME_CURRENCY, isCurrency } from "../lib/expenses";
import type { RateTable } from "../lib/rates";

// 使用者選的 每一筆都帶那筆日期的匯率 自己改過的換日期時不蓋掉 換貨幣時重新帶

/** 同一頁換回同一天不用再問 讀不到的不留 下次再問 */
const tables = new Map<string, Promise<RateTable | null>>();

function readTable(date: string): Promise<RateTable | null> {
  const known = tables.get(date);
  if (known) return known;
  const table = fetch(`/api/travel/rates?date=${date}`)
    .then((response) => (response.ok ? (response.json() as Promise<RateTable>) : null))
    .catch(() => null);
  tables.set(date, table);
  void table.then((result) => result || tables.delete(date));
  return table;
}

/** 日期輸入框打到一半會出現 0002 年這種值 不問 */
const isUsableDate = (date: string) => /^20\d\d-\d\d-\d\d$/.test(date);

const dayText = (date: string) => formatTaipeiMonthDay(new Date(`${date}T12:00:00+08:00`));

/** 修改舊帳時 rate 是存的匯率 當成自己填的 */
export function useAutoRate(saved: string) {
  const [rate, setRate] = useState(saved);
  const [note, setNote] = useState("");
  const typed = useRef(saved !== "");
  // 換得很快時只認最後一次 舊的回應晚到也不蓋掉
  const latest = useRef(0);

  const fill = (currency: string, date: string) => {
    const request = ++latest.current;
    if (currency === HOME_CURRENCY || !isCurrency(currency) || !isUsableDate(date)) return setNote("");
    setNote("讀取匯率中…");
    void readTable(date).then((table) => {
      if (request !== latest.current) return;
      const value = table?.rates[currency];
      if (!table || !value) return setNote("匯率暫時無法讀取，請自己填");
      typed.current = false;
      setRate(value);
      setNote(`已帶入 ${dayText(table.date)} 的國際中間價`);
    });
  };

  return {
    rate,
    note,
    typeRate(value: string) {
      latest.current += 1;
      typed.current = true;
      setRate(value);
      setNote("");
    },
    changeCurrency(currency: string, date: string) {
      typed.current = false;
      setRate("");
      fill(currency, date);
    },
    changeDate(currency: string, date: string) {
      if (!typed.current) fill(currency, date);
    },
  };
}
