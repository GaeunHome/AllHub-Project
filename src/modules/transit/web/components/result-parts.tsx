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

/** 查詢結果每一班都有一顆 寫字會整排重複 所以只放星星 名稱給報讀器 */
export function StarTrain({ fields, name, saved }: { fields: Record<string, string>; name: string; saved: boolean }) {
  if (saved)
    return (
      <span className="trn-star-saved">
        <Icon name="star-filled" label="已在常用" className="size-5" />
      </span>
    );
  return (
    <ActionButton action={addRouteAction} fields={fields} aria-label={`把 ${name}加到常用`} title="加到常用" className="btn-ghost btn-sm btn-icon trn-star">
      <Icon name="star" className="size-5" />
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
