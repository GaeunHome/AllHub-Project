import { starrailInfo } from "@/modules/starrail/info";
import { WarpsPage } from "@/modules/starrail/web/pages/warps-page";

export default function Page({ searchParams }: PageProps<"/starrail/warps">) {
  return <WarpsPage info={starrailInfo} searchParams={searchParams} />;
}
