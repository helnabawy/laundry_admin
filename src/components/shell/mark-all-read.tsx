"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { CheckCheck } from "lucide-react";
import { markNotificationsRead } from "@/server/actions/notifications";
import { Button } from "@/components/ui/button";

export function MarkAllRead() {
  const t = useTranslations("notifications");
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await markNotificationsRead();
          router.refresh();
        })
      }
    >
      <CheckCheck aria-hidden /> {t("markAllRead")}
    </Button>
  );
}
