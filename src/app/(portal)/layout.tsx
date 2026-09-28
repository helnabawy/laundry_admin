import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { requireSession } from "@/server/auth/session";
import { listActiveVendors, VENDOR_COOKIE } from "@/server/auth/scope";
import { unreadCount } from "@/server/notifications";
import { BrandMark } from "@/components/shell/brand-mark";
import { Nav } from "@/components/shell/nav";
import { MobileNav } from "@/components/shell/mobile-nav";
import { NotificationBell } from "@/components/shell/notification-bell";
import { OrderSearch } from "@/components/shell/order-search";
import { LanguageToggle, ThemeToggle } from "@/components/shell/preferences";
import { UserMenu } from "@/components/shell/user-menu";
import { VendorSwitcher } from "@/components/shell/vendor-switcher";

export default async function PortalLayout({ children }: LayoutProps<"/">) {
  const session = await requireSession();
  const t = await getTranslations();
  const [unread, vendors] = await Promise.all([unreadCount(session), listActiveVendors()]);
  const selectedVendor = (await cookies()).get(VENDOR_COOKIE)?.value ?? "all";

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[15.5rem_1fr]">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:start-3 focus:top-3 focus:z-[60] focus:rounded-control focus:bg-stamp focus:px-3 focus:py-2 focus:text-on-stamp"
      >
        {t("nav.skipToContent")}
      </a>

      <aside className="sticky top-0 hidden h-dvh flex-col gap-7 overflow-y-auto border-e border-rule px-3 py-5 lg:flex">
        <div className="px-2">
          <BrandMark label={t("common.appName")} />
        </div>
        <Nav role={session.role} unread={unread} />
        <p className="mt-auto px-3 text-xs text-ink-3">{t(`roles.${session.role}`)}</p>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-40 flex h-16 items-center gap-2 border-b border-rule bg-counter/90 px-3 backdrop-blur-sm sm:px-5">
          <MobileNav role={session.role} unread={unread} />
          <OrderSearch className="w-full max-w-md" />
          <div className="ms-auto flex items-center gap-1">
            {session.role === "SUPER_ADMIN" && vendors.length > 1 ? (
              <VendorSwitcher vendors={vendors} value={selectedVendor} />
            ) : null}
            <div className="hidden sm:block">
              <LanguageToggle />
            </div>
            <div className="sm:hidden">
              <LanguageToggle compact />
            </div>
            <ThemeToggle />
            <NotificationBell initialUnread={unread} />
            <div className="ms-1">
              <UserMenu name={session.name} email={session.email} role={session.role} />
            </div>
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-[100rem] flex-1 px-3 pb-16 pt-6 sm:px-5 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
