import { StatusIcon } from "@/components/ui/status-icon";

type FormFeedbackProps = {
  readonly message: string | null;
  /** Reserve no height while empty, for layouts that control their own spacing. */
  readonly compact?: boolean;
  /** Lets a field point at this region with aria-describedby. */
  readonly id?: string;
};

// The live region stays mounted (empty) so screen readers announce changes.
// The icon and the sr-only prefix mean the state is not conveyed by color alone.
// Success text uses the body text color: --color-success alone is under 4.5:1 on
// a surface in the light palette, so the icon carries the color instead.

/** A visible, accessible form-level error region. Renders nothing visible when `message` is null. */
export function FormError({ message, compact, id }: FormFeedbackProps) {
  return (
    <div id={id} role="alert" aria-live="polite" className={`${compact ? "" : "min-h-5 "}text-sm text-danger`}>
      {message ? (
        <p className="flex gap-1.5">
          <StatusIcon kind="error" />
          <span>
            <span className="sr-only">Error: </span>
            {message}
          </span>
        </p>
      ) : null}
    </div>
  );
}

/** A visible, accessible form-level success region. Renders nothing visible when `message` is null. */
export function FormSuccess({ message }: FormFeedbackProps) {
  return (
    <div role="status" aria-live="polite" className="min-h-5 text-sm text-text">
      {message ? (
        <p className="flex gap-1.5">
          <span className="text-success">
            <StatusIcon kind="success" />
          </span>
          <span>
            <span className="sr-only">Success: </span>
            {message}
          </span>
        </p>
      ) : null}
    </div>
  );
}
