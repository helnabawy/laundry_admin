"use client";

import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { useLocale } from "next-intl";

export function Providers({ children }: { children: React.ReactNode }) {
  const locale = useLocale();
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
      <Toaster
        position={locale === "ar" ? "bottom-left" : "bottom-right"}
        dir={locale === "ar" ? "rtl" : "ltr"}
        toastOptions={{
          classNames: {
            toast:
              "!bg-card !text-ink !border !border-rule !shadow-lift !rounded-[6px] !font-sans",
            description: "!text-ink-2",
            actionButton: "!bg-stamp !text-on-stamp",
          },
        }}
      />
    </ThemeProvider>
  );
}
