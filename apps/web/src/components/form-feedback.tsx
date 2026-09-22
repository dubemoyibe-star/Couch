type FormFeedbackProps = {
  readonly message: string | null;
};

/** A visible, accessible form-level error region. Renders nothing visible when `message` is null. */
export function FormError({ message }: FormFeedbackProps) {
  return (
    <div role="alert" aria-live="polite" className="min-h-5 text-sm text-red-600">
      {message}
    </div>
  );
}

/** A visible, accessible form-level success region. Renders nothing visible when `message` is null. */
export function FormSuccess({ message }: FormFeedbackProps) {
  return (
    <div role="status" aria-live="polite" className="min-h-5 text-sm text-green-600">
      {message}
    </div>
  );
}
