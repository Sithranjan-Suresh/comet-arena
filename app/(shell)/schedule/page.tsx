import { EmptyState } from "@/components/ui";

export const metadata = { title: "Schedule" };

export default function Page() {
  return (
    <>
      <h1 className="mb-4 text-4xl font-extrabold uppercase">Schedule</h1>
      <EmptyState
        title="Coming soon"
        description="Every stage of your saved competitions in one place. Built in Task 62."
      />
    </>
  );
}
