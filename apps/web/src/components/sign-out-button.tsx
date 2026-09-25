"use client";

import { useFormStatus } from "react-dom";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Submit control for the sign-out form; shows the shared pending treatment while the action runs. */
export function SignOutButton() {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      variant="secondary"
      loading={pending}
      loadingLabel="Signing out…"
      className="min-h-10 w-full justify-start rounded-sm border-transparent bg-transparent px-3"
    >
      <LogOut aria-hidden="true" className="size-4" />
      Sign out
    </Button>
  );
}
