import { createAuthClient } from "better-auth/react";

// Browser-side client. Only used for flows that must start in the browser
// (the Google redirect). Email/password stays on Server Actions. With no
// baseURL it targets the current origin's /api/auth.
export const authClient = createAuthClient();
