"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useAuthStore } from "@/lib/auth-store";
import { MailHubProvider } from "@/lib/signalr";
import { ThemeProvider } from "@/components/shell/theme";
import { ToastProvider } from "@/components/shell/toast";
import { configureAuthPersistence } from "@/components/shell/auth-persistence";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, refetchOnWindowFocus: false },
        },
      })
  );

  useEffect(() => {
    configureAuthPersistence();
    useAuthStore.persist.rehydrate();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider><ToastProvider><MailHubProvider>{children}</MailHubProvider></ToastProvider></ThemeProvider>
    </QueryClientProvider>
  );
}
