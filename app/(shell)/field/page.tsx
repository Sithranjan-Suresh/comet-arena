import { EmptyState } from "@/components/ui";

export const metadata = { title: "The Field" };

export default function Page() {
  return (
    <>
      <h1 className="mb-4 text-4xl font-extrabold uppercase">The Field</h1>
      <EmptyState
        title="Coming soon"
        description="Every UTD competition, sorted by what is due next. Built in Task 55."
      />
    </>
  );
}
