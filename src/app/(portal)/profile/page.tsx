import { getTranslations } from "next-intl/server";
import { requireSession } from "@/server/auth/session";
import { PageHeader } from "@/components/ui/page-header";
import { Sheet, SheetHeader } from "@/components/ui/sheet";
import { LanguageToggle, ThemeToggle } from "@/components/shell/preferences";
import { ChangePassword, ProfileName } from "@/components/people/profile-forms";

export async function generateMetadata() {
  const t = await getTranslations("profile");
  return { title: t("title") };
}

export default async function ProfilePage() {
  const session = await requireSession();
  const t = await getTranslations();
  return (
    <>
      <PageHeader title={t("profile.title")} description={t("profile.description")} />
      <div className="flex max-w-2xl flex-col gap-5">
        <Sheet>
          <SheetHeader title={session.name} />
          <div className="flex flex-col gap-5 px-4 py-4 sm:px-5">
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-[12.5px] text-ink-3">{t("profile.email")}</dt>
                <dd dir="ltr" className="text-start">{session.email}</dd>
              </div>
              <div>
                <dt className="text-[12.5px] text-ink-3">{t("profile.role")}</dt>
                <dd>{t(`roles.${session.role}`)}</dd>
              </div>
            </dl>
            <ProfileName name={session.name} />
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-control bg-card-recessed px-3 py-2">
              <span className="text-sm font-medium">{t("profile.language")}</span>
              <span className="flex items-center gap-1">
                <LanguageToggle />
                <ThemeToggle />
              </span>
            </div>
          </div>
        </Sheet>
        <Sheet>
          <SheetHeader title={t("profile.changePassword")} />
          <div className="px-4 py-4 sm:px-5">
            <ChangePassword />
          </div>
        </Sheet>
      </div>
    </>
  );
}
