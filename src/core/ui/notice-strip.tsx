import Link from "next/link";
import type { ReactNode } from "react";
import { Icon, type UiIconName } from "./icon";

export type NoticeTone = "danger" | "warning" | "info";

const TONE_ICONS: Record<NoticeTone, UiIconName> = { danger: "circle-alert", warning: "bell-ring", info: "circle-dot" };

/**
 * 重要的事不用卡片 一條貼著頁面的橫線 一件接一件 手機上一件一行
 * 裡面的項目可能都還沒出現或都不用顯示 整條由 CSS 藏起來 不留空白
 */
export function NoticeStrip({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <section aria-label={label} className={className ? `notice-strip ${className}` : "notice-strip"}>
      <p className="notice-strip-label">{label}</p>
      <ul className="notice-strip-list">{children}</ul>
    </section>
  );
}

type NoticeItemProps = { tone: NoticeTone; title: string; detail?: string | null; href?: string };

export function NoticeItem({ tone, title, detail, href }: NoticeItemProps): ReactNode {
  const body = (
    <>
      <Icon name={TONE_ICONS[tone]} className="size-4 shrink-0" />
      <span className="font-semibold text-ink">{title}</span>
      {detail && <span className="text-ink-soft tabular-nums">{detail}</span>}
    </>
  );
  return (
    <li data-tone={tone} className="notice-item">
      {href ? (
        <Link href={href} className="notice-item-body notice-item-link">
          {body}
          <Icon name="chevron-right" className="size-4 shrink-0 text-ink-soft" />
        </Link>
      ) : (
        <span className="notice-item-body">{body}</span>
      )}
    </li>
  );
}
