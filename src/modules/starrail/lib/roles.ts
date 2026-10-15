// 同一個帳號在各伺服器各有角色 連結時讓使用者選 頁面上用伺服器名稱切換

const SERVERS: Record<string, string> = {
  prod_official_asia: "亞服",
  prod_official_usa: "美服",
  prod_official_eur: "歐服",
  prod_official_cht: "台港澳服",
};

export function serverLabel(region: string, regionName?: string | null): string {
  return SERVERS[region] ?? regionName ?? region;
}

/** 低於這個等級又不是最高的角色 多半是試玩一下就沒在玩的 */
const LOW_LEVEL = 20;

type Leveled = { level: number | null };

export function likelyUnused(role: Leveled, roles: Leveled[]): boolean {
  if (role.level === null || role.level >= LOW_LEVEL) return false;
  const highest = Math.max(...roles.map((r) => r.level ?? -1));
  return role.level < highest;
}

/** 使用者通常只玩一個伺服器 預設勾等級最高的 同等級挑前面的 */
export function defaultRoleSelection<T extends Leveled & { uid: string }>(roles: T[]): string[] {
  if (roles.length === 0) return [];
  const best = roles.reduce((top, r) => ((r.level ?? -1) > (top.level ?? -1) ? r : top), roles[0]);
  return [best.uid];
}
