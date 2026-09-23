"use client";

import { useActionState } from "react";
import { FormError } from "@/components/form-feedback";
import { SubmitButton } from "@/components/submit-button";
import { joinCouchAction, type JoinCouchState } from "./actions";

const initialState: JoinCouchState = { error: null };

export function JoinCouchForm({ inviteCode }: { inviteCode: string }) {
  const [state, formAction] = useActionState(joinCouchAction, initialState);

  return (
    <form action={formAction} className="flex flex-col items-center gap-2">
      <input type="hidden" name="inviteCode" value={inviteCode} />
      <SubmitButton>Join couch</SubmitButton>
      <FormError message={state.error} />
    </form>
  );
}
