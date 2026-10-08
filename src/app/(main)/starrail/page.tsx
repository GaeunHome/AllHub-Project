import { starrailInfo } from "@/modules/starrail/info";
import { StarrailPage } from "@/modules/starrail/web/pages/starrail-page";

export default function Page() {
  return <StarrailPage info={starrailInfo} />;
}
