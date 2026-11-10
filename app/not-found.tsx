import { NotFoundView } from "@/components/shell/NotFoundView";

// Root-level 404 (URLs that match no route). Rendered without the shell chrome.
export default function RootNotFound() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
      <NotFoundView />
    </main>
  );
}
