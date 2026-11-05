import Link from "next/link";
import { ActionButton } from "@/core/ui/action-button";
import { Icon } from "@/core/ui/icon";
import type { Station } from "../../lib/timetable";
import { addRouteAction } from "../actions";
import { closedHref, type SearchQuery } from "../search-query";

// 查詢結果共用的小零件

export function AddRoute({ fields, label = "加到常用路線" }: { fields: Record<string, string>; label?: string }) {
  return (
    <ActionButton action={addRouteAction} fields={fields} className="btn-secondary btn-sm">
      <Icon name="plus" className="size-4" />
      {label}
    </ActionButton>
  );
}

export function CloseResults({ query, className = "" }: { query: SearchQuery; className?: string }) {
  return (
    <Link href={closedHref(query)} scroll={false} aria-label="關閉查詢結果" className={`icon-button shrink-0 ${className}`}>
      <Icon name="x" className="size-4" />
    </Link>
  );
}

export const stationName = (list: readonly Station[], id: string) => list.find((station) => station.id === id)?.name ?? id;
