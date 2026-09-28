"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { ArrowDown, ArrowUp } from "lucide-react";
import { toast } from "sonner";
import { moveCategoryAction } from "@/server/actions/catalogue";
import { Button } from "@/components/ui/button";

export function MoveButtons({ id, first, last }: { id: string; first: boolean; last: boolean }) {
  const t = useTranslations("catalogue");
  const [pending, start] = useTransition();
  const move = (dir: "up" | "down") =>
    start(async () => {
      const res = await moveCategoryAction(id, dir);
      if (!res.ok) toast.error(res.error);
    });
  return (
    <span className="flex">
      <Button variant="ghost" size="iconSm" disabled={first || pending} onClick={() => move("up")} aria-label={t("moveUp")}>
        <ArrowUp aria-hidden />
      </Button>
      <Button variant="ghost" size="iconSm" disabled={last || pending} onClick={() => move("down")} aria-label={t("moveDown")}>
        <ArrowDown aria-hidden />
      </Button>
    </span>
  );
}
