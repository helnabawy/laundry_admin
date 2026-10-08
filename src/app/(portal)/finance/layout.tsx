import { getTranslations } from "next-intl/server";
import { requirePage } from "@/server/auth/session";
import { PageHeader } from "@/components/ui/page-header";
import { FinanceTabs } from "@/components/finance/finance-tabs";

export async function generateMetadata() {
  const t = await getTranslations("finance");
  return { title: t("title") };
}

export default async function FinanceLayout({ children }: LayoutProps<"/finance">) {
  const session = await requirePage("finance.view");
  const t = await getTranslations("finance");
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <FinanceTabs canManage={session.role !== "USER"} />
      {children}
    </>
  );
}
