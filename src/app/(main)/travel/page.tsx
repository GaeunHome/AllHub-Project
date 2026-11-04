import { travelInfo } from "@/modules/travel/info";
import { TravelPage } from "@/modules/travel/web/pages/travel-page";

export default function Page() {
  return <TravelPage info={travelInfo} />;
}
