import { AUDIT_OUTCOMES, type AuditOutcome } from "../db/schema";
import { MODULE_ID_PATTERN, USER_ID_PATTERN } from "../ids";
import type { SearchParams } from "../module";

export const AUDIT_PAGE_SIZE = 50;

export type AuditQuery = { actor?: string; module?: string; outcome?: AuditOutcome; ip?: string; batch?: string; page: number };

type Params = Awaited<SearchParams>;

const single = (value: Params[string]) => (typeof value === "string" ? value.trim() : "");
const isOutcome = (value: string): value is AuditOutcome => (AUDIT_OUTCOMES as readonly string[]).includes(value);

/** 網址誰都能改 認不得的條件當成沒有篩選 不把怪值放進查詢 */
export function parseAuditQuery(params: Params): AuditQuery {
  const moduleId = single(params.module);
  const outcome = single(params.outcome);
  const batch = single(params.batch).toLowerCase();
  const page = Number(single(params.page));
  return {
    ...(single(params.actor) ? { actor: single(params.actor) } : {}),
    ...(MODULE_ID_PATTERN.test(moduleId) ? { module: moduleId } : {}),
    ...(isOutcome(outcome) ? { outcome } : {}),
    ...(single(params.ip) ? { ip: single(params.ip) } : {}),
    ...(USER_ID_PATTERN.test(batch) ? { batch } : {}),
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
}

/** 換條件時回到第一頁 changes 的值是 undefined 就拿掉那個條件 */
export function auditHref(query: AuditQuery, changes: Partial<AuditQuery>): string {
  const merged = { ...query, page: 1, ...changes };
  const params = Object.entries(merged).filter(([key, value]) => value !== undefined && !(key === "page" && value === 1));
  const search = new URLSearchParams(params.map(([key, value]) => [key, String(value)])).toString();
  return search ? `/admin/logs?${search}` : "/admin/logs";
}
