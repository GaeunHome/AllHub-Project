import { travelInfo } from "@/modules/travel/info";
import { TripPage } from "@/modules/travel/web/pages/trip-page";

export default function Page({ params }: PageProps<"/travel/[id]">) {
  return <TripPage info={travelInfo} params={params} />;
}
