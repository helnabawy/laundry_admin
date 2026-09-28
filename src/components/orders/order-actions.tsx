"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  ArrowRight,
  Ban,
  ClipboardPen,
  Loader2,
  PackageCheck,
  RotateCcw,
  Truck,
  UserRoundCheck,
  UserRoundPen,
} from "lucide-react";
import { toast } from "sonner";
import {
  assignPickupDriverAction,
  cancelOrderAction,
  markCleanedAction,
  receiveFromDriverAction,
  retryDeliveryAction,
} from "@/server/actions/orders";
import type { ActionResult } from "@/server/actions/result";
import type { DriverOption } from "@/server/queries/orders";
import { staffActions, type OrderKind, type OrderStatus, type TransitionId } from "@/domain/order-workflow";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { isolate } from "@/lib/format";

export interface ActionOrder {
  id: string;
  number: number;
  kind: OrderKind;
  status: OrderStatus;
  pickupDriver: string | null;
  deliveryDriver: string | null;
}

const ICON: Partial<Record<TransitionId, React.ComponentType<{ className?: string }>>> = {
  assignPickupDriver: UserRoundCheck,
  reassignPickupDriver: UserRoundPen,
  receiveFromDriver: PackageCheck,
  issueInvoice: ClipboardPen,
  markCleaned: Truck,
  retryDelivery: RotateCcw,
  cancel: Ban,
};

type Dialogs = "driver" | "receive" | "cancel" | null;

/**
 * The stamp: the one legal next step for this order, plus secondary actions.
 * Every commit states its consequence first (PRODUCT.md principle 2).
 */
export function OrderActions({
  order,
  drivers,
  canCancel,
  layout = "ticket",
  onAdvance,
  onRevert,
}: {
  order: ActionOrder;
  drivers: DriverOption[];
  canCancel: boolean;
  layout?: "ticket" | "detail";
  /** Called the moment a commit is confirmed (the tear-off). */
  onAdvance?: () => void;
  onRevert?: () => void;
}) {
  const t = useTranslations("actions");
  const tc = useTranslations("common");
  const available = staffActions(order).filter((a) => a !== "cancel" || canCancel);
  const primary = available.find((a) => a !== "cancel" && a !== "reassignPickupDriver") ?? null;
  const secondary = available.filter((a) => a !== primary);
  const [dialog, setDialog] = useState<Dialogs>(null);
  const [driverAction, setDriverAction] = useState<TransitionId | null>(null);
  const [pending, start] = useTransition();

  const commit = (fn: () => Promise<ActionResult<unknown>>, success: string) => {
    setDialog(null);
    onAdvance?.();
    start(async () => {
      const res = await fn();
      if (res.ok) toast.success(success);
      else {
        onRevert?.();
        toast.error(res.error);
      }
    });
  };

  const open = (a: TransitionId) => {
    if (a === "assignPickupDriver" || a === "reassignPickupDriver" || a === "markCleaned" || a === "retryDelivery") {
      setDriverAction(a);
      setDialog("driver");
    } else if (a === "receiveFromDriver") setDialog("receive");
    else if (a === "cancel") setDialog("cancel");
  };

  const PrimaryIcon = primary ? ICON[primary] : null;

  return (
    <>
      {primary === "issueInvoice" ? (
        <Button asChild variant="stamp" size={layout === "detail" ? "lg" : "md"} className={cn(layout === "ticket" && "w-full")}>
          <Link href={`/orders/${order.id}/invoice`}>
            <ClipboardPen aria-hidden />
            {t("issueInvoice")}
            <ArrowRight className="flip-rtl ms-auto" aria-hidden />
          </Link>
        </Button>
      ) : primary ? (
        <Button
          variant="stamp"
          size={layout === "detail" ? "lg" : "md"}
          className={cn(layout === "ticket" && "w-full")}
          disabled={pending}
          onClick={() => open(primary)}
        >
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : PrimaryIcon ? <PrimaryIcon aria-hidden /> : null}
          {t(primary)}
        </Button>
      ) : null}

      {layout === "detail" && secondary.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {secondary.map((a) => {
            const Icon = ICON[a];
            return (
              <Button
                key={a}
                variant={a === "cancel" ? "dangerOutline" : "outline"}
                disabled={pending}
                onClick={() => open(a)}
              >
                {Icon ? <Icon aria-hidden /> : null}
                {t(a)}
              </Button>
            );
          })}
        </div>
      ) : null}

      <Dialog open={dialog === "driver"} onOpenChange={(o) => !o && setDialog(null)}>
        {driverAction ? (
          <DriverDialog
            action={driverAction}
            order={order}
            drivers={drivers}
            onConfirm={(driverId, driverName) => {
              const fn =
                driverAction === "markCleaned"
                  ? () => markCleanedAction(order.id, driverId)
                  : driverAction === "retryDelivery"
                    ? () => retryDeliveryAction(order.id, driverId)
                    : () => assignPickupDriverAction(order.id, driverId);
              commit(fn, t(`${driverAction}Done`, { number: order.number, driver: isolate(driverName) }));
            }}
            closeLabel={tc("close")}
            onClose={() => setDialog(null)}
          />
        ) : null}
      </Dialog>

      <Dialog open={dialog === "receive"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent
          title={t("receiveTitle", { number: order.number })}
          description={order.kind === "SHOP" ? t("receiveBodyShop") : t("receiveBodyWizard")}
          closeLabel={tc("close")}
        >
          <ConsequenceList
            items={
              order.kind === "SHOP"
                ? [t("receiveConsequenceShop1"), t("receiveConsequenceShop2")]
                : [t("receiveConsequenceWizard1"), t("receiveConsequenceWizard2")]
            }
          />
          <DialogFooter
            confirm={t("receiveConfirm")}
            cancel={tc("cancel")}
            onCancel={() => setDialog(null)}
            onConfirm={() =>
              commit(() => receiveFromDriverAction(order.id), t("receiveFromDriverDone", { number: order.number }))
            }
          />
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "cancel"} onOpenChange={(o) => !o && setDialog(null)}>
        <CancelDialog
          order={order}
          closeLabel={tc("close")}
          onConfirm={(reason) => commit(() => cancelOrderAction(order.id, reason), t("cancelDone", { number: order.number }))}
          onClose={() => setDialog(null)}
        />
      </Dialog>
    </>
  );
}

function ConsequenceList({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-col gap-2 rounded-control bg-card-recessed p-3 text-sm">
      {items.map((item) => (
        <li key={item} className="flex gap-2">
          <ArrowRight className="flip-rtl mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function DialogFooter({
  confirm,
  cancel,
  onConfirm,
  onCancel,
  disabled,
  danger,
}: {
  confirm: string;
  cancel: string;
  onConfirm: () => void;
  onCancel: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button variant="ghost" onClick={onCancel}>
        {cancel}
      </Button>
      <Button variant={danger ? "danger" : "stamp"} onClick={onConfirm} disabled={disabled}>
        {confirm}
      </Button>
    </div>
  );
}

function DriverDialog({
  action,
  order,
  drivers,
  onConfirm,
  onClose,
  closeLabel,
}: {
  action: TransitionId;
  order: ActionOrder;
  drivers: DriverOption[];
  onConfirm: (driverId: string, driverName: string) => void;
  onClose: () => void;
  closeLabel: string;
}) {
  const t = useTranslations("actions");
  const tc = useTranslations("common");
  const [selected, setSelected] = useState<string | null>(null);
  const sorted = [...drivers].sort((a, b) => Number(b.isAvailable) - Number(a.isAvailable) || a.load - b.load);
  const isDelivery = action === "markCleaned" || action === "retryDelivery";

  return (
    <DialogContent
      title={t(`${action}Title`, { number: order.number })}
      description={t(`${action}Body`)}
      closeLabel={closeLabel}
    >
      {drivers.length === 0 ? (
        <p className="rounded-control bg-card-recessed p-3 text-sm text-ink-2">{t("noDrivers")}</p>
      ) : (
        <fieldset>
          <legend className="sr-only">{t("chooseDriver")}</legend>
          <div className="flex flex-col gap-2">
            {sorted.map((d) => (
              <label
                key={d.id}
                className={cn(
                  "flex min-h-14 cursor-pointer items-center gap-3 rounded-control border px-3 py-2.5 transition-colors",
                  selected === d.id ? "border-ink bg-card-recessed" : "border-rule hover:border-rule-strong",
                )}
              >
                <input
                  type="radio"
                  name="driver"
                  value={d.id}
                  className="size-4 accent-[var(--stamp)]"
                  checked={selected === d.id}
                  onChange={() => setSelected(d.id)}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{d.name}</span>
                  <span className="block text-[13px] text-ink-3" dir="ltr">
                    {d.phone}
                  </span>
                </span>
                <span className="text-end text-[13px]">
                  <span className="block text-ink-2">{t("driverLoad", { count: d.load })}</span>
                  <span className={cn("block", d.isAvailable ? "text-success" : "text-ink-3")}>
                    {d.isAvailable ? t("driverAvailable") : t("driverOffShift")}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <p className="mt-4 text-[13px] text-ink-2">{isDelivery ? t("notifiesDelivery") : t("notifiesPickup")}</p>
      <DialogFooter
        confirm={t(`${action}Confirm`)}
        cancel={tc("cancel")}
        disabled={!selected}
        onCancel={onClose}
        onConfirm={() => {
          const d = drivers.find((x) => x.id === selected);
          if (d) onConfirm(d.id, d.name);
        }}
      />
    </DialogContent>
  );
}

function CancelDialog({
  order,
  onConfirm,
  onClose,
  closeLabel,
}: {
  order: ActionOrder;
  onConfirm: (reason: string) => void;
  onClose: () => void;
  closeLabel: string;
}) {
  const t = useTranslations("actions");
  const tc = useTranslations("common");
  const [reason, setReason] = useState("");
  return (
    <DialogContent title={t("cancelTitle", { number: order.number })} description={t("cancelBody")} closeLabel={closeLabel}>
      <Field label={t("cancelReason")} htmlFor={`cancel-${order.id}`}>
        <Textarea
          id={`cancel-${order.id}`}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={500}
          placeholder={t("cancelReasonPlaceholder")}
        />
      </Field>
      <DialogFooter
        danger
        confirm={t("cancelConfirm")}
        cancel={tc("back")}
        disabled={reason.trim().length < 3}
        onCancel={onClose}
        onConfirm={() => onConfirm(reason.trim())}
      />
    </DialogContent>
  );
}
