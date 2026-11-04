import { travelInfo } from "@/modules/travel/info";
import { JoinPage } from "@/modules/travel/web/pages/join-page";

export default function Page({ params }: PageProps<"/travel/join/[id]/[token]">) {
  return <JoinPage info={travelInfo} params={params} />;
}
