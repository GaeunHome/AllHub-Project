import type { TeamMember } from "../../lib/endgame";
import { ElementBadge, Portrait, rarityClass } from "./sr-visuals";

/** 上場隊伍的角色頭像：稀有度底色、屬性小圓標與等級；讀不到圖時是屬性色底加名字的第一個字 */
export function TeamAvatar({ member, name }: { member: TeamMember; name: string | null }) {
  return (
    <span className="flex w-12 flex-col items-center gap-0.5" title={[name, member.level !== null ? `Lv.${member.level}` : null].filter(Boolean).join(" ")}>
      <span className={`relative size-12 overflow-hidden rounded-md ${rarityClass(member.rarity)}`}>
        <Portrait src={member.icon} name={name} element={member.element} placeholder="?" />
        <span className="absolute -right-0.5 -bottom-0.5">
          <ElementBadge element={member.element} className="size-4 text-[0.5625rem]" />
        </span>
      </span>
      <span className="sr-num text-[0.8125rem] leading-none font-semibold text-ink-soft">{member.level !== null ? `Lv.${member.level}` : "—"}</span>
    </span>
  );
}
