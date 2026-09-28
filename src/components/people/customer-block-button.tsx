"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Ban, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { setCustomerActiveAction } from "@/server/actions/people";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { isolate } from "@/lib/format";

/** Block states its consequence first; unblocking is harmless, so it isn't. */
export function CustomerBlockButton({ id, name, isActive }: { id: string; name: string; isActive: boolean }) {
  const t = useTranslations("users");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  const commit = (active: boolean) => {
    setOpen(false);
    start(async () => {
      const res = await setCustomerActiveAction(id, active);
      if (res.ok) toast.success(active ? t("unblocked", { name: isolate(name) }) : t("blocked", { name: isolate(name) }));
      else toast.error(res.error);
    });
  };

  if (!isActive) {
    return (
      <Button variant="outline" disabled={pending} onClick={() => commit(true)}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : <RotateCcw aria-hidden />}
        {t("unblock")}
      </Button>
    );
  }
  return (
    <>
      <Button variant="dangerOutline" disabled={pending} onClick={() => setOpen(true)}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Ban aria-hidden />}
        {t("block")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={t("blockTitle", { name: isolate(name) })} description={t("blockBody")} closeLabel={tc("close")}>
          <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {tc("back")}
            </Button>
            <Button variant="danger" onClick={() => commit(false)}>
              {t("blockConfirm")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
