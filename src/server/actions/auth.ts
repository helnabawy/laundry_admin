"use server";

import { verify } from "@node-rs/argon2";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { db } from "@/server/db";
import { endSession, getSession, startSession } from "@/server/auth/session";
import { LOCALE_COOKIE, isLocale } from "@/i18n/config";
import { VENDOR_COOKIE } from "@/server/auth/scope";

export interface LoginState {
  error?: string;
  email?: string;
}

// A real hash of a random string, so unknown emails cost the same time.
const DUMMY_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$3M6BSn8wASo4i3nKQPC2HA$HwiTxO7fsssOSdZYUctwJHUxnZJ+jZvPhW3erJpFW/Y";

export async function login(_prev: LoginState, form: FormData): Promise<LoginState> {
  const t = await getTranslations("auth");
  const parsed = z
    .object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1) })
    .safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { error: t("invalid"), email: String(form.get("email") ?? "") };

  const { email, password } = parsed.data;
  const user = await db.staffUser.findUnique({ where: { email } });
  const valid = await verify(user?.passwordHash ?? DUMMY_HASH, password).catch(() => false);
  if (!user || !valid) return { error: t("invalid"), email };
  if (!user.isActive) return { error: t("disabled"), email };

  await db.staffUser.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await startSession(user.id);
  (await cookies()).set(LOCALE_COOKIE, user.locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });

  const next = String(form.get("next") ?? "");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/orders");
}

export async function logout() {
  await endSession();
  (await cookies()).delete(VENDOR_COOKIE);
  redirect("/login");
}

/** Switches the portal language and remembers it on the account. */
export async function setLocale(locale: string) {
  if (!isLocale(locale)) return;
  (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  const session = await getSession();
  if (session) await db.staffUser.update({ where: { id: session.userId }, data: { locale } });
}

/** Super admin's laundry switcher. */
export async function setVendorFilter(vendorId: string) {
  const session = await getSession();
  if (!session || session.role !== "SUPER_ADMIN") return;
  (await cookies()).set(VENDOR_COOKIE, vendorId || "all", { path: "/", sameSite: "lax" });
}
