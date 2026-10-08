import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "./icon";

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="back-link">
      <Icon name="chevron-left" className="size-4" />
      {children}
    </Link>
  );
}
