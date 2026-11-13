import "server-only";
import { readExternalJson, type ExternalFetchOptions } from "@/core/external-url";
import { parseTwdRates, ratesUrls, type RateDay, type RateTable } from "../lib/rates";

/** 兩個網址依序問 那一天的還沒有時改用最新的 都讀不到回 null */
export async function fetchRates(day: RateDay, options: ExternalFetchOptions = {}): Promise<RateTable | null> {
  for (const url of ratesUrls(day)) {
    const table = await readExternalJson(url, { module: "travel", what: "讀不到匯率", parse: parseTwdRates, ...options });
    if (table) return table;
  }
  return day === "latest" ? null : fetchRates("latest", options);
}
