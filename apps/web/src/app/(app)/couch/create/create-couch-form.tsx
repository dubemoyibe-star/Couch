"use client";

import { useActionState, useState } from "react";
import { couchNameSchema } from "@couch/contracts";
import { authButtonClass } from "@/components/auth-shell";
import { FormError } from "@/components/form-feedback";
import { Button } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { Input } from "@/components/ui/input";
import { couchNameErrorMessage } from "@/lib/couch-name-error";
import { createCouchAction, type CreateCouchState } from "./actions";

const initialState: CreateCouchState = { error: null };

/** The same couch name rule the contracts package exports, checked client-side before submit. */
function clientNameError(name: string): string | null {
  const parsed = couchNameSchema.safeParse(name);
  return parsed.success ? null : couchNameErrorMessage(parsed.error.issues[0]);
}

/** `autoFocus` puts the cursor in the name field, for the modal, where focus would otherwise start on the close button. */
export function CreateCouchForm({ autoFocus = false }: { readonly autoFocus?: boolean }) {
  const [state, formAction, pending] = useActionState(createCouchAction, initialState);
  const [name, setName] = useState("");
  const [touched, setTouched] = useState(false);

  const nameError = touched ? clientNameError(name) : null;

  return (
    <form action={formAction} className="flex w-full flex-col">
      <Input
        label="Couch name"
        name="name"
        type="text"
        required
        autoFocus={autoFocus}
        focusTone="brand"
        value={name}
        error={nameError}
        onChange={(event) => setName(event.target.value)}
        onBlur={() => setTouched(true)}
      />
      <fieldset className="mt-4 flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium text-text">Visibility</legend>
        <label className="flex min-h-11 items-center gap-3 text-text">
          <input type="radio" name="visibility" value="private" defaultChecked className="size-4" />
          <span>Private: only people with the invite link can join</span>
        </label>
        <label className="flex min-h-11 items-center gap-3 text-text">
          <input type="radio" name="visibility" value="public" className="size-4" />
          <span>Public: anyone can find and join</span>
        </label>
      </fieldset>
      <Button type="submit" loading={pending} loadingLabel="Creating…" className={cx(authButtonClass, "mt-3")}>
        Create couch
      </Button>
      <div className="has-[p]:mt-3">
        <FormError message={state.error} compact />
      </div>
    </form>
  );
}
