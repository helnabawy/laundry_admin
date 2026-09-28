import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";

export default async function NotFound() {
  const t = await getTranslations("errors");
  return (
    <main className="grid min-h-[70dvh] place-items-center px-4">
      <div className="text-center">
        <p className="numerals text-[64px] font-semibold leading-none tracking-[-0.05em] [font-stretch:80%] text-ink-3">404</p>
        <h1 className="mt-3 text-xl font-semibold">{t("notFoundTitle")}</h1>
        <p className="mt-1 max-w-[44ch] text-sm text-ink-2">{t("notFoundBody")}</p>
        <Button asChild variant="stamp" className="mt-5">
          <Link href="/orders">{t("goToOrders")}</Link>
        </Button>
      </div>
    </main>
  );
}
