"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { couchNameSchema } from "@couch/contracts";
import { FormError } from "@/components/form-feedback";
import { SubmitButton } from "@/components/submit-button";
import { createCouchAction, type CreateCouchState } from "./actions";

const initialState: CreateCouchState = { error: null };

/** The same couch name rule the contracts package exports, checked client-side before submit. */
function clientNameError(name: string): string | null {
  const parsed = couchNameSchema.safeParse(name);
  return parsed.success ? null : (parsed.error.issues[0]?.message ?? "That couch name is not valid.");
}

export function CreateCouchForm() {
  const [state, formAction] = useActionState(createCouchAction, initialState);
  const [name, setName] = useState("");
  const [touched, setTouched] = useState(false);

  const nameError = touched ? clientNameError(name) : null;

  return (
    <form action={formAction} className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="name" className="text-sm font-medium">
          Couch name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={() => setTouched(true)}
          className="rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-black"
        />
        <FormError message={nameError} />
      </div>
      <FormError message={state.error} />
      <div className="flex items-center gap-4">
        <SubmitButton>Create couch</SubmitButton>
        <Link href="/" className="text-sm underline">
          Cancel
        </Link>
      </div>
    </form>
  );
}
