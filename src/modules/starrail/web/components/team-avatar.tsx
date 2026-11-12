import type { TeamMember } from "../../lib/endgame";
import { ElementBadge, Portrait, rarityClass } from "./sr-visuals";

/**
 * 上場隊伍的角色小卡 使用者選的 稀有度底色上放頭像 角上是屬性與星魂 下緣是等級
 * 讀不到圖時是屬性色底加名字的第一個字
 */
export function TeamAvatar({ member, name }: { member: TeamMember; name: string | null }) {
  const eidolon = member.eidolon ?? 0;
  return (
    <span className={`sr-member ${rarityClass(member.rarity)}`} title={[name, member.level !== null ? `Lv.${member.level}` : null].filter(Boolean).join(" ")}>
      <Portrait src={member.icon} name={name} element={member.element} placeholder="?" />
      <span className="sr-member-element">
        {/* 屬性圖示跟著小卡放大 */}
        <ElementBadge element={member.element} src={member.elementIcon} className="size-[max(1rem,calc(var(--sr-team,3rem)*0.24))] text-[0.5625rem]" />
      </span>
      {/* 0 魂不標 角落才不會每張都有字 */}
      {eidolon > 0 && <span className="sr-member-eidolon">{eidolon} 魂</span>}
      <span className="sr-member-level sr-num">{member.level !== null ? `Lv.${member.level}` : "—"}</span>
    </span>
  );
}
