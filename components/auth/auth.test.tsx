// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { AuthControl } from "@/components/auth/AuthControl";
import { PendingActionRunner } from "@/components/auth/PendingActionRunner";
import { ToastProvider } from "@/components/ui";
import { registerPendingHandler, savePendingAction } from "@/lib/pending-action";

const id = "22222222-2222-4222-8222-222222222222";

function mount(user: { id: string; email: string } | null) {
  return render(
    <AuthProvider initialUser={user}>
      <ToastProvider>
        <PendingActionRunner />
      </ToastProvider>
    </AuthProvider>,
  );
}

describe("PendingActionRunner", () => {
  beforeEach(() => sessionStorage.clear());

  it("completes the saved action after sign-in and announces it", async () => {
    const handler = vi.fn(async () => "Saved. Its deadlines are on your schedule.");
    const off = registerPendingHandler("save", handler);
    savePendingAction({ type: "save", competitionId: id });
    mount({ id: "u1", email: "a@utdallas.edu" });
    await waitFor(() => expect(handler).toHaveBeenCalledWith({ type: "save", competitionId: id }));
    expect(
      await screen.findByText("Saved. Its deadlines are on your schedule."),
    ).toBeInTheDocument();
    off();
  });

  it("does nothing while signed out (the action stays queued)", () => {
    const handler = vi.fn(async () => {});
    const off = registerPendingHandler("save", handler);
    savePendingAction({ type: "save", competitionId: id });
    mount(null);
    expect(handler).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("comet:pending-action")).not.toBeNull();
    off();
  });

  it("shows an error toast when the action fails", async () => {
    const off = registerPendingHandler("save", async () => {
      throw new Error("boom");
    });
    savePendingAction({ type: "save", competitionId: id });
    mount({ id: "u1", email: "a@utdallas.edu" });
    expect(await screen.findByText(/could not finish that action/i)).toBeInTheDocument();
    off();
  });
});

describe("AuthControl", () => {
  it("offers sign in when signed out and sign out when signed in", () => {
    const { unmount } = render(
      <AuthProvider initialUser={null}>
        <AuthControl />
      </AuthProvider>,
    );
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
    unmount();
    render(
      <AuthProvider initialUser={{ id: "u1", email: "a@utdallas.edu" }}>
        <AuthControl />
      </AuthProvider>,
    );
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
  });
});
