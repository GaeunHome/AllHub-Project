import Link from "next/link";
import { DRAG_SCROLL } from "@/core/ui/drag-scroll";
import { placeHref, type PlaceTab } from "../place-tabs";
import { Flag } from "./weather-images";

type Chip = Pick<PlaceTab, "key" | "name" | "country">;

/** 使用者要的 這裡只切換城市 排序與移除都在管理視窗 */
export function PlaceChips({ tabs, selectedKey }: { tabs: Chip[]; selectedKey: string }) {
  return (
    <nav aria-label="城市" {...DRAG_SCROLL} className="wx-places no-scrollbar">
      {tabs.map((tab) => (
        <Link key={tab.key} href={placeHref(tab.key)} scroll={false} aria-current={tab.key === selectedKey ? "page" : undefined} className="wx-chip">
          <Flag country={tab.country} size={18} />
          {tab.name}
        </Link>
      ))}
    </nav>
  );
}
