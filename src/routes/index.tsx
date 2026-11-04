import { createFileRoute } from "@tanstack/react-router";
import { getBoard } from "@/lib/league/api";
import { PublicBoard } from "@/components/vdqg/board";
import { TopBar } from "@/components/vdqg/ui";

export const Route = createFileRoute("/")({
  loader: () => getBoard(),
  component: Home,
});

function Home() {
  const board = Route.useLoaderData();
  return (
    <>
      <TopBar />
      <PublicBoard board={board} />
      <footer className="mx-auto max-w-6xl px-4 py-8 text-xs text-muted">
        Nhóm Đảk Nhân Tâm · Tôn Đức Thắng · hệ thống điều hành giải, không bán vé.
      </footer>
    </>
  );
}
