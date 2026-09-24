"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { couchNameSchema } from "@couch/contracts";
import { authButtonClass } from "@/components/auth-shell";
import { FormError } from "@/components/form-feedback";
import { Button } from "@/components/ui/button";
import { calmTransition, cx, focusRing } from "@/components/ui/cx";
import { Input } from "@/components/ui/input";
import { createCouchAction, type CreateCouchState } from "./actions";

const initialState: CreateCouchState = { error: null };

/** The same couch name rule the contracts package exports, checked client-side before submit. */
function clientNameError(name: string): string | null {
  const parsed = couchNameSchema.safeParse(name);
  return parsed.success ? null : (parsed.error.issues[0]?.message ?? "That couch name is not valid.");
}

type CreateCouchFormProps = {
  /** Set inside a dialog, which has its own close control, so the Cancel link is left out. */
  readonly onCancel?: () => void;
};

export function CreateCouchForm({ onCancel }: CreateCouchFormProps) {
  const [state, formAction, pending] = useActionState(createCouchAction, initialState);
  const [name, setName] = useState("");
  const [touched, setTouched] = useState(false);

  const cancelClass = cx(
    "self-center rounded-sm text-sm text-text-muted underline underline-offset-4 hover:text-text",
    calmTransition,
    focusRing,
  );

  const nameError = touched ? clientNameError(name) : null;

  return (
    <form action={formAction} className="flex w-full flex-col gap-4">
      <Input
        label="Couch name"
        name="name"
        type="text"
        required
        focusTone="brand"
        value={name}
        error={nameError}
        onChange={(event) => setName(event.target.value)}
        onBlur={() => setTouched(true)}
      />
      <FormError message={state.error} />
      <Button type="submit" loading={pending} loadingLabel="Creating…" className={authButtonClass}>
        Create couch
      </Button>
      {onCancel ? null : (
        <Link href="/" className={cancelClass}>
          Cancel
        </Link>
      )}
    </form>
  );
}
