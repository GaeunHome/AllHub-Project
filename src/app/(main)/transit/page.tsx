import type { SearchParams } from "@/core/module";
import { transitInfo } from "@/modules/transit/info";
import { TransitPage } from "@/modules/transit/web/pages/transit-page";

export default function Page({ searchParams }: { searchParams: SearchParams }) {
  return <TransitPage info={transitInfo} searchParams={searchParams} />;
}
