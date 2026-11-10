import Link from "next/link";
import { EmptyState, buttonClasses } from "@/components/ui";

export function NotFoundView() {
  return (
    <EmptyState
      title="Out of bounds"
      description="We could not find that page. The competition may have been removed or the link is wrong."
      action={
        <Link href="/field" className={buttonClasses("primary")}>
          Browse The Field
        </Link>
      }
    />
  );
}
