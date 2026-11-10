import { EmptyState } from "@/components/ui";

export const metadata = { title: "Free Agency" };

export default function Page() {
  return (
    <>
      <h1 className="mb-4 text-4xl font-extrabold uppercase">Free Agency</h1>
      <EmptyState
        title="Coming soon"
        description="Find teammates for a competition. Built in Tasks 83-84."
      />
    </>
  );
}
