import type { SearchParams } from "@/core/module";
import { TransitPage } from "@/modules/transit/web/pages/transit-page";

export default function Page({ searchParams }: { searchParams: SearchParams }) {
  return <TransitPage searchParams={searchParams} />;
}
