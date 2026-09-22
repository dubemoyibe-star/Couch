import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";

const PUBLIC_PATHS = new Set(["/sign-in", "/sign-up"]);

// Runs on the Node.js runtime (the Next.js 16 default for proxy), so it can call
// auth.api.getSession directly and validate the session against the database instead of only
// checking whether a session cookie is present.
export async function proxy(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  const isPublicPath = PUBLIC_PATHS.has(request.nextUrl.pathname);

  if (!session && !isPublicPath) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  if (session && isPublicPath) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
