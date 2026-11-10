import { EmptyState } from "@/components/ui";

export const metadata = { title: "Player Card" };

export default function Page() {
  return (
    <>
      <h1 className="mb-4 text-4xl font-extrabold uppercase">Player Card</h1>
      <EmptyState
        title="Coming soon"
        description="Your private competition history. Built in Task 87."
      />
    </>
  );
}
