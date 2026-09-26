"use client";

import { useActionState, useState } from "react";
import { Globe, Lock, type LucideIcon } from "lucide-react";
import { couchNameSchema } from "@couch/contracts";
import { authButtonClass } from "@/components/auth-shell";
import { FormError } from "@/components/form-feedback";
import { Button } from "@/components/ui/button";
import { calmTransition, cx } from "@/components/ui/cx";
import { Input } from "@/components/ui/input";
import { couchNameErrorMessage } from "@/lib/couch-name-error";
import type { DefaultVisibility } from "@/lib/default-visibility";
import { createCouchAction, type CreateCouchState } from "./actions";

const initialState: CreateCouchState = { error: null };

/** The same couch name rule the contracts package exports, checked client-side before submit. */
function clientNameError(name: string): string | null {
  const parsed = couchNameSchema.safeParse(name);
  return parsed.success ? null : couchNameErrorMessage(parsed.error.issues[0]);
}

function VisibilityOption({
  value,
  title,
  description,
  icon: Icon,
  defaultChecked = false,
}: {
  readonly value: "private" | "public";
  readonly title: string;
  readonly description: string;
  readonly icon: LucideIcon;
  readonly defaultChecked?: boolean;
}) {
  return (
    <label
      className={cx(
        "relative flex min-h-11 cursor-pointer items-start gap-3 rounded-md border border-border-strong bg-surface p-3 text-left hover:border-text-muted",
        "has-[:checked]:border-primary has-[:checked]:bg-primary/5 has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus",
        calmTransition,
      )}
    >
      <input type="radio" name="visibility" value={value} defaultChecked={defaultChecked} className="peer sr-only" />
      <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-text-muted peer-checked:text-primary" />
      <span className="flex flex-col">
        <span className="text-sm font-medium text-text">{title}</span>
        <span className="text-xs text-text-muted">{description}</span>
      </span>
    </label>
  );
}

/** `autoFocus` puts the cursor in the name field, for the modal, where focus would otherwise start on the close button. */
export function CreateCouchForm({
  autoFocus = false,
  defaultVisibility = "private",
}: {
  readonly autoFocus?: boolean;
  readonly defaultVisibility?: DefaultVisibility;
}) {
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
      <fieldset className="mt-5 flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium text-text">Who can join?</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <VisibilityOption value="private" title="Private" description="Only people with your invite link" icon={Lock} defaultChecked={defaultVisibility === "private"} />
          <VisibilityOption value="public" title="Public" description="Anyone can find and join" icon={Globe} defaultChecked={defaultVisibility === "public"} />
        </div>
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
