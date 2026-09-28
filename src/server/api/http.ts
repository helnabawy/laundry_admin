import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";
import { db } from "@/server/db";
import { DomainError } from "@/server/orders/transition";
import { TransitionError } from "@/domain/order-workflow";
import type { MobileUser } from "@/generated/prisma/client";

/**
 * Shared plumbing for the mobile app's REST API (see
 * laundry_app/lib/core/network/api_endpoints.dart).
 *
 * Errors are RFC 7807 ProblemDetails — the app reads `detail` for the message
 * and treats 401 as "session expired".
 */

export type Lang = "en" | "ar";

export function langOf(req: Request): Lang {
  const header = req.headers.get("accept-language") ?? "";
  return header.trim().toLowerCase().startsWith("ar") ? "ar" : "en";
}

/** Picks the request language's value from an `xEn` / `xAr` pair. */
export function tr(lang: Lang, en: string, ar: string): string {
  return lang === "ar" ? ar || en : en || ar;
}

export function problem(status: number, detail: string, title?: string) {
  return NextResponse.json(
    { type: "about:blank", title: title ?? defaultTitle(status), status, detail },
    { status, headers: { "content-type": "application/problem+json" } },
  );
}

function defaultTitle(status: number) {
  switch (status) {
    case 400:
      return "Bad Request";
    case 401:
      return "Unauthorized";
    case 403:
      return "Forbidden";
    case 404:
      return "Not Found";
    case 409:
      return "Conflict";
    default:
      return "Error";
  }
}

export function ok<T>(body: T, status = 200) {
  return NextResponse.json(body, { status });
}

export function noContent() {
  return new NextResponse(null, { status: 204 });
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export const badRequest = (message: string) => new HttpError(400, message);
export const notFound = (message = "Not found") => new HttpError(404, message);

/** Wraps a handler so thrown errors become ProblemDetails. */
export function handle<C>(
  fn: (req: NextRequest, ctx: C) => Promise<Response>,
): (req: NextRequest, ctx: C) => Promise<Response> {
  return async (req, ctx) => {
    try {
      return await fn(req, ctx);
    } catch (error) {
      if (error instanceof HttpError) return problem(error.status, error.message);
      if (error instanceof DomainError) return problem(error.status, error.message);
      if (error instanceof TransitionError) return problem(409, error.message);
      if (error instanceof z.ZodError) {
        const first = error.issues[0];
        return problem(
          400,
          first ? `${first.path.join(".") || "body"}: ${first.message}` : "Invalid request",
        );
      }
      console.error("[api]", req.method, req.nextUrl.pathname, error);
      return problem(500, "Something went wrong");
    }
  };
}

export async function readJson<T>(req: Request, schema: z.ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw badRequest("Request body must be JSON");
  }
  return schema.parse(body);
}

// ---- Mobile auth ----------------------------------------------------------

const TOKEN_TTL = "30d";

function mobileSecret() {
  const value = process.env.MOBILE_JWT_SECRET;
  if (!value) throw new Error("MOBILE_JWT_SECRET is not set");
  return new TextEncoder().encode(value);
}

export async function signMobileToken(userId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(TOKEN_TTL)
    .sign(mobileSecret());
}

export async function mobileUser(req: Request): Promise<MobileUser> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) throw new HttpError(401, "Sign in required");
  let userId: string | undefined;
  try {
    userId = (await jwtVerify(token, mobileSecret())).payload.sub;
  } catch {
    throw new HttpError(401, "Your session has expired");
  }
  const user = userId ? await db.mobileUser.findUnique({ where: { id: userId } }) : null;
  if (!user || !user.isActive) throw new HttpError(401, "Your session has expired");
  return user;
}

export async function mobileDriver(req: Request): Promise<MobileUser> {
  const user = await mobileUser(req);
  if (user.role !== "driver") throw new HttpError(403, "Drivers only");
  return user;
}
