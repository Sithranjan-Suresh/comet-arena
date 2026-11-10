"use client";
import type { ReactNode } from "react";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { PendingActionRunner } from "@/components/auth/PendingActionRunner";
import { ToastProvider } from "@/components/ui";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <ToastProvider>
        {children}
        <PendingActionRunner />
      </ToastProvider>
    </AuthProvider>
  );
}
