import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { db } from "@/server/db";
import { can, type Capability, type StaffRole } from "@/lib/permissions";

/**
 * Portal session: a signed, HTTP-only cookie holding the staff user id. The
 * user row is re-read on every request so a deactivated account or a role
 * change takes effect immediately.
 */

export const SESSION_COOKIE = "laundry_admin_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12;

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value) throw new Error("SESSION_SECRET is not set");
  return new TextEncoder().encode(value);
}

export async function signSessionToken(staffUserId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(staffUserId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secret());
}

export async function verifySessionToken(
  token: string,
): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

export async function startSession(staffUserId: string) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, await signSessionToken(staffUserId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function endSession() {
  (await cookies()).delete(SESSION_COOKIE);
}

export interface Session {
  userId: string;
  name: string;
  email: string;
  role: StaffRole;
  /** null for SUPER_ADMIN (platform-wide). */
  vendorId: string | null;
  locale: string;
}

export const getSession = cache(async (): Promise<Session | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const userId = await verifySessionToken(token);
  if (!userId) return null;
  const user = await db.staffUser.findUnique({ where: { id: userId } });
  if (!user || !user.isActive) return null;
  return {
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    vendorId: user.vendorId,
    locale: user.locale,
  };
});

export class ForbiddenError extends Error {
  constructor(capability?: Capability) {
    super(capability ? `Missing permission: ${capability}` : "Forbidden");
    this.name = "ForbiddenError";
  }
}

/** For pages: redirects to login when signed out. */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

/** For pages: signed out → login; lacking the capability → dashboard. */
export async function requirePage(capability: Capability): Promise<Session> {
  const session = await requireSession();
  if (!can(session.role, capability)) redirect("/dashboard");
  return session;
}

/** For server actions / route handlers: throws instead of redirecting. */
export async function requireCapability(
  capability: Capability,
): Promise<Session> {
  const session = await getSession();
  if (!session) throw new ForbiddenError();
  if (!can(session.role, capability)) throw new ForbiddenError(capability);
  return session;
}
