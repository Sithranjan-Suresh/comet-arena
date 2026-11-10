// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  Button,
  Dialog,
  EmptyState,
  ErrorState,
  Input,
  Select,
  Skeleton,
  ToastProvider,
  ToggleChip,
  useToast,
} from "@/components/ui";

describe("Button", () => {
  it("defaults to type=button so it never submits forms by accident", () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole("button", { name: "Save" })).toHaveAttribute("type", "button");
  });

  it("blocks clicks and sets aria-busy while loading", async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Save
      </Button>,
    );
    const btn = screen.getByRole("button", { name: "Save" });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("aria-busy", "true");
    await userEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("fires onClick when enabled", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Go</Button>);
    await userEvent.click(screen.getByRole("button", { name: "Go" }));
    expect(onClick).toHaveBeenCalledOnce();
  });
});

describe("Field controls", () => {
  it("associates the label and exposes a hint", () => {
    render(<Input label="Team name" hint="Up to 80 characters" />);
    const input = screen.getByLabelText("Team name");
    expect(input).toHaveAccessibleDescription("Up to 80 characters");
  });

  it("marks the control invalid and announces the error instead of the hint", () => {
    render(<Input label="Title" hint="hint text" error="Title is required" />);
    const input = screen.getByLabelText("Title");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Title is required");
    expect(screen.getByRole("alert")).toHaveTextContent("Title is required");
  });

  it("keeps a hidden label available to assistive tech", () => {
    render(<Input label="Search competitions" hideLabel />);
    expect(screen.getByLabelText("Search competitions")).toBeInTheDocument();
  });

  it("renders select options", async () => {
    render(
      <Select label="Format" defaultValue="virtual">
        <option value="virtual">Virtual</option>
        <option value="in_person">In person</option>
      </Select>,
    );
    await userEvent.selectOptions(screen.getByLabelText("Format"), "in_person");
    expect(screen.getByLabelText("Format")).toHaveValue("in_person");
  });
});

describe("ToggleChip", () => {
  it("reports its pressed state and toggles", async () => {
    function Harness() {
      const [on, setOn] = useState(false);
      return (
        <ToggleChip selected={on} onChange={setOn}>
          Hackathon
        </ToggleChip>
      );
    }
    render(<Harness />);
    const chip = screen.getByRole("button", { name: "Hackathon" });
    expect(chip).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(chip);
    expect(chip).toHaveAttribute("aria-pressed", "true");
  });
});

describe("Dialog", () => {
  it("opens, is labelled by its title, and reports close", () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <Dialog open={false} onClose={onClose} title="Add entry">
        <p>Body</p>
      </Dialog>,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    rerender(
      <Dialog open onClose={onClose} title="Add entry">
        <p>Body</p>
      </Dialog>,
    );
    expect(screen.getByRole("dialog", { name: "Add entry" })).toBeInTheDocument();
    rerender(
      <Dialog open={false} onClose={onClose} title="Add entry">
        <p>Body</p>
      </Dialog>,
    );
    expect(onClose).toHaveBeenCalled();
  });
});

describe("states", () => {
  it("EmptyState shows a next action", () => {
    render(<EmptyState title="Nothing saved yet" action={<Button>Browse The Field</Button>} />);
    expect(screen.getByRole("heading", { name: "Nothing saved yet" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Browse The Field" })).toBeInTheDocument();
  });

  it("ErrorState is an alert and retries", async () => {
    const onRetry = vi.fn();
    render(<ErrorState message="Could not load" onRetry={onRetry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("Skeleton is hidden from assistive tech", () => {
    const { container } = render(<Skeleton className="h-4" />);
    expect(container.firstChild).toHaveAttribute("aria-hidden", "true");
  });
});

describe("Toast", () => {
  function Trigger({ n = 1 }: { n?: number }) {
    const toast = useToast();
    return (
      <button
        onClick={() => {
          for (let i = 0; i < n; i++) toast.show(`Message ${i + 1}`, "success");
        }}
      >
        fire
      </button>
    );
  }

  it("announces a message and auto-dismisses", async () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    await act(async () => screen.getByText("fire").click());
    expect(screen.getByText("Message 1")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(4100);
    });
    expect(screen.queryByText("Message 1")).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it("keeps at most three toasts on screen", async () => {
    render(
      <ToastProvider>
        <Trigger n={5} />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByText("fire"));
    expect(screen.getAllByRole("status")).toHaveLength(3);
    expect(screen.getByText("Message 5")).toBeInTheDocument();
    expect(screen.queryByText("Message 1")).not.toBeInTheDocument();
  });

  it("throws a clear error without a provider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Trigger />)).toThrow(/ToastProvider/);
    spy.mockRestore();
  });
});
