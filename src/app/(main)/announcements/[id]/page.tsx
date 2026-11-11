import { AnnouncementPage } from "@/core/announcements/announcement-page";

export default function Page({ params }: PageProps<"/announcements/[id]">) {
  return <AnnouncementPage params={params} />;
}
