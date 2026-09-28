import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "laundry_admin_session";

/**
 * Optimistic gate for portal pages: no session cookie → login. The real
 * check (signature, active account, role) runs in every page and action.
 * The mobile API (`/api/*`) authenticates with Bearer tokens instead.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSession = request.cookies.has(SESSION_COOKIE);
  if (pathname === "/login") {
    return hasSession ? NextResponse.redirect(new URL("/orders", request.url)) : NextResponse.next();
  }
  if (!hasSession) {
    const url = new URL("/login", request.url);
    if (pathname !== "/") url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|uploads|catalog|.*\\.(?:png|jpg|jpeg|webp|svg|ico|txt)$).*)"],
};
