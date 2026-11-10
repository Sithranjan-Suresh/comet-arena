"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { PendingActionRunner } from "@/components/auth/PendingActionRunner";
import { ToastProvider } from "@/components/ui";

export function Providers({ children }: { children: ReactNode }) {
  // One client per browser session (created lazily so SSR never shares cache between requests).
  const [queryClient] = useState(
    () =>
      new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          {children}
          <PendingActionRunner />
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
