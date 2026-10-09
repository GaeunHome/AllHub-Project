import { starrailInfo } from "@/modules/starrail/info";
import { StarrailPage } from "@/modules/starrail/web/pages/starrail-page";

export default function Page({ searchParams }: PageProps<"/starrail">) {
  return <StarrailPage info={starrailInfo} searchParams={searchParams} />;
}
