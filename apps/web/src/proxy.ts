import { NextResponse, type NextRequest } from "next/server";
import { getAuth } from "@/lib/auth";

const PUBLIC_PATHS = new Set(["/sign-in", "/sign-up"]);

// Runs on the Node.js runtime (the Next.js 16 default for proxy), so it can call
// auth.api.getSession directly and validate the session against the database instead of only
// checking whether a session cookie is present.
export async function proxy(request: NextRequest) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  const isPublicPath = PUBLIC_PATHS.has(request.nextUrl.pathname);

  if (!session && !isPublicPath) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  if (session && isPublicPath) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

// Public static assets and metadata files must bypass the session check, or
// signed-out requests for them (logo, icons, manifest, social images) are
// redirected to /sign-in and arrive as HTML instead of the file. The matcher
// must be a static string, so the exclusions are written inline.
export const config = {
  matcher: [
    "/((?!api/auth|_next/static|_next/image|brand/|icons/|favicon.ico|icon.png|apple-icon.png|manifest.webmanifest|opengraph-image.png|twitter-image.png).*)",
  ],
};
