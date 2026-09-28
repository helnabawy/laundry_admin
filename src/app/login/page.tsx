import { getTranslations } from "next-intl/server";
import { BrandMark } from "@/components/shell/brand-mark";
import { LanguageToggle, ThemeToggle } from "@/components/shell/preferences";
import { LoginForm } from "./login-form";

export async function generateMetadata() {
  const t = await getTranslations("auth");
  return { title: t("title") };
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const t = await getTranslations();
  const { next } = await searchParams;
  return (
    <main className="relative grid min-h-dvh place-items-center px-4 py-10">
      <div className="absolute end-4 top-4 flex items-center gap-1">
        <LanguageToggle />
        <ThemeToggle />
      </div>
      <div className="w-full max-w-[25rem]">
        <div className="mb-8 flex justify-center">
          <BrandMark label={t("common.appName")} />
        </div>
        {/* The sign-in form is a claim ticket: stub band, perforation, body. */}
        <section className="ticket-notched rounded-ticket bg-card shadow-lift" aria-labelledby="login-title">
          <div className="h-[34px] rounded-t-ticket bg-canary" aria-hidden />
          <div className="perforation" aria-hidden />
          <div className="px-5 pb-6 pt-5 sm:px-7 sm:pb-7">
            <h1 id="login-title" className="text-[22px] font-semibold tracking-[-0.01em]">
              {t("auth.title")}
            </h1>
            <p className="mt-1 text-sm text-ink-2">{t("auth.subtitle")}</p>
            <LoginForm next={typeof next === "string" ? next : undefined} />
          </div>
        </section>
        <p className="mt-6 text-center text-[13px] text-ink-3">{t("auth.driversAndCustomers")}</p>
      </div>
    </main>
  );
}
