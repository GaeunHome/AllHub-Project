import { NotificationsPage } from "@/core/notifications/notifications-page";
import { modules } from "@/modules";

export default function Page({ searchParams }: PageProps<"/notifications">) {
  return <NotificationsPage modules={modules} searchParams={searchParams} />;
}
