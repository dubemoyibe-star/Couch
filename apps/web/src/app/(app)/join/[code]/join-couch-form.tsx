"use client";

import { useActionState } from "react";
import { authButtonClass } from "@/components/auth-shell";
import { FormError } from "@/components/form-feedback";
import { Button } from "@/components/ui/button";
import { joinCouchAction, type JoinCouchState } from "./actions";

const initialState: JoinCouchState = { error: null };

export function JoinCouchForm({ inviteCode }: { inviteCode: string }) {
  const [state, formAction, pending] = useActionState(joinCouchAction, initialState);

  return (
    <form action={formAction} className="flex w-full flex-col">
      <input type="hidden" name="inviteCode" value={inviteCode} />
      <Button type="submit" loading={pending} loadingLabel="Joining…" className={authButtonClass}>
        Join couch
      </Button>
      <FormError message={state.error} compact />
    </form>
  );
}
