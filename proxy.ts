import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/signup"];

// Keep in sync with lib/supabase/server.ts (audit H-2).
const cookieOptions = {
  path: "/",
  sameSite: "lax" as const,
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  maxAge: 60 * 60 * 24 * 30,
};

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/")) || pathname === "/";
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    {
      cookieOptions,
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, { ...cookieOptions, ...options }),
          );
        },
      },
    },
  );

  // Keep the session fresh (auto-refresh tokens).
  const { data: { user } } = await supabase.auth.getUser();
  const { pathname } = request.nextUrl;

  const wantsAuth = !isPublic(pathname);

  if (wantsAuth && !user) {
    // Send unauthenticated users to /login, remembering where they wanted to go.
    const url = new URL("/login", request.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (!wantsAuth && user && isPublic(pathname)) {
    // Signed-in users who hit the marketing/landing or auth pages go to /dashboard.
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    // Run on all page routes except static assets. API routes are excluded on
    // purpose: they self-authenticate and answer 401, while this proxy exists
    // to redirect unauthenticated *browsers* to /login (a 307 to an HTML page
    // is useless for programmatic API clients).
    "/((?!api/|_next/static|_next/image|favicon.ico|.*\\\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
