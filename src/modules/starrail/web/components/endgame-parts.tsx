import type { ReactNode } from "react";
import { ExternalImage } from "@/core/ui/external-image";
import { InfoTip } from "@/core/ui/info-tip";
import type { ChallengeBuff, TeamMember } from "../../lib/endgame";
import { TeamAvatar } from "./team-avatar";

// 終局戰績與異相仲裁共用的小零件

export type Names = Record<number, string | null>;

/** 總覽的大數字 上面是標籤 */
export function Figure({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-sm font-medium text-ink">{label}</dt>
      <dd className="sr-num flex items-baseline gap-1 text-3xl leading-none font-bold whitespace-nowrap text-ink">{children}</dd>
    </div>
  );
}

export function Team({ avatars, names }: { avatars: TeamMember[]; names: Names }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {avatars.map((member, i) => (
        <TeamAvatar key={`${member.id}-${i}`} member={member} name={member.id === null ? null : (names[member.id] ?? null)} />
      ))}
    </div>
  );
}

/** 增益的圖示與名稱 說明收在 i 圓圈 */
export function BuffLine({ buff, iconSize = "size-6" }: { buff: ChallengeBuff; iconSize?: string }) {
  if (!buff.name) return null;
  return (
    <p className="flex items-center gap-2 text-ink">
      {buff.icon && (
        <span aria-hidden className={`relative shrink-0 ${iconSize}`}>
          <ExternalImage src={buff.icon} alt="" fill className="object-contain" />
        </span>
      )}
      <span className="font-semibold">{buff.name}</span>
      {buff.description && <InfoTip label={`${buff.name}的說明`}>{buff.description}</InfoTip>}
    </p>
  );
}

/** 隊伍編號的小方塊 報讀器念第幾隊 */
export function TeamNumber({ slot }: { slot: number }) {
  return (
    <span className="sr-team-number sr-num">
      <span aria-hidden>{slot}</span>
      <span className="sr-only">第 {slot} 隊</span>
    </span>
  );
}
