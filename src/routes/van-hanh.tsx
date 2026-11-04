import { createFileRoute } from "@tanstack/react-router";
import { getOps } from "@/lib/league/api";
import { OpsApp } from "@/components/vdqg/ops";
import { TopBar } from "@/components/vdqg/ui";

export const Route = createFileRoute("/van-hanh")({
  loader: () => getOps(),
  component: Page,
});

function Page() {
  const data = Route.useLoaderData();
  const unread = data.notes.filter((n) => !n.daDoc).length;
  return (
    <>
      <TopBar user={data.user} unread={unread} />
      <OpsApp data={data} />
    </>
  );
}
