"use client";
import { useState } from "react";
import {
  Button,
  Chip,
  Dialog,
  EmptyState,
  ErrorState,
  GameCardSkeleton,
  Input,
  Select,
  Textarea,
  ToastProvider,
  ToggleChip,
  useToast,
} from "@/components/ui";

function ToastButton() {
  const toast = useToast();
  return (
    <Button variant="secondary" onClick={() => toast.show("Saved to your schedule", "success")}>
      Show toast
    </Button>
  );
}

export function UiDemo() {
  const [open, setOpen] = useState(false);
  const [on, setOn] = useState(true);
  return (
    <ToastProvider>
      <section aria-labelledby="ui" className="space-y-6">
        <h2 id="ui" className="text-xl font-semibold">
          Components
        </h2>

        <div className="flex flex-wrap gap-3">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
          <Button disabled>Disabled</Button>
          <Button loading>Saving</Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Team name" hint="Up to 80 characters" placeholder="Comet Coders" />
          <Input label="Title" error="Title is required" defaultValue="" />
          <Select label="Format" defaultValue="hybrid">
            <option value="in_person">In person</option>
            <option value="virtual">Virtual</option>
            <option value="hybrid">Hybrid</option>
          </Select>
          <Textarea label="Note" hint="280 characters max" />
        </div>

        <div className="flex flex-wrap gap-2">
          <ToggleChip selected={on} onChange={setOn}>
            Hackathon
          </ToggleChip>
          <ToggleChip selected={!on} onChange={(v) => setOn(!v)}>
            Case comp
          </ToggleChip>
          <Chip>Free</Chip>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button onClick={() => setOpen(true)}>Open dialog</Button>
          <ToastButton />
        </div>
        <Dialog open={open} onClose={() => setOpen(false)} title="Add entry">
          <p className="mb-4">Native dialog: focus is trapped and Escape closes it.</p>
          <Button onClick={() => setOpen(false)}>Done</Button>
        </Dialog>

        <div className="grid gap-4 md:grid-cols-3">
          <GameCardSkeleton />
          <EmptyState
            title="Nothing saved yet"
            description="Save a competition to see its deadlines here."
            action={<Button>Browse The Field</Button>}
          />
          <ErrorState message="We could not load competitions." onRetry={() => {}} />
        </div>
      </section>
    </ToastProvider>
  );
}
