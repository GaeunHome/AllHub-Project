import { transitInfo } from "@/modules/transit/info";
import { TransitLayout } from "@/modules/transit/web/pages/transit-layout";

export default function Layout({ children }: LayoutProps<"/transit">) {
  return <TransitLayout info={transitInfo}>{children}</TransitLayout>;
}
