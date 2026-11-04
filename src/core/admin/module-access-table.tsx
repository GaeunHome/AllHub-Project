import { displayNameOf } from "../auth/nickname";
import { ROLE_LABELS } from "../db/schema";
import type { ModuleInfo } from "../module";
import { Icon } from "../ui/icon";
import { ModuleAccessBox } from "./module-access-box";
import type { ManagedUser, ModuleDenial } from "./service";

type ModuleAccessTableProps = { users: ManagedUser[]; modules: Pick<ModuleInfo, "id" | "name" | "icon" | "accent">[]; denials: ModuleDenial[] };

/** 捲動時蓋住後面的欄 要跟卡片同一個底色 */
const STICKY_CELL = "sticky left-0 z-10 bg-[var(--surface)]";
const deniedKey = (userId: string, moduleId: string) => `${userId}:${moduleId}`;

/** 手機放不下時表格自己橫向捲動 帳號欄固定在左邊 */
export function ModuleAccessTable({ users, modules, denials }: ModuleAccessTableProps) {
  const denied = new Set(denials.map(({ userId, moduleId }) => deniedKey(userId, moduleId)));

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="text-[0.8125rem] text-ink-soft">
            <th scope="col" className={`${STICKY_CELL} pr-4 pb-1.5 text-left font-medium`}>
              帳號
            </th>
            {modules.map((module) => (
              <th key={module.id} scope="col" data-accent={module.accent} className="min-w-[4.75rem] px-1 pb-1.5 text-center font-medium whitespace-nowrap">
                <span className="flex flex-col items-center gap-1">
                  <Icon src={module.icon} className="size-5 text-accent" />
                  {module.name}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {users.map((user) => {
            const name = displayNameOf(user);
            return (
              <tr key={user.id}>
                <th scope="row" className={`${STICKY_CELL} max-w-44 min-w-28 py-1 pr-4 text-left font-normal`}>
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="font-semibold break-words text-ink">{name}</span>
                    {user.role === "owner" && <span className="chip chip-brand">{ROLE_LABELS.owner}</span>}
                  </span>
                  {user.nickname && <span className="block text-[0.8125rem] break-words text-ink-soft">{user.username}</span>}
                </th>
                {modules.map((module) => (
                  <td key={module.id} className="px-1 py-1 text-center">
                    {user.role === "owner" ? (
                      <span className="inline-grid min-h-11 min-w-11 place-items-center align-middle">
                        <input type="checkbox" aria-label={`${name}：${module.name}`} checked disabled className="size-4.5" />
                      </span>
                    ) : (
                      <ModuleAccessBox userId={user.id} moduleId={module.id} allowed={!denied.has(deniedKey(user.id, module.id))} label={`${name}：${module.name}`} />
                    )}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
