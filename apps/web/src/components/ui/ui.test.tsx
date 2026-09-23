import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FormError, FormSuccess } from "@/components/form-feedback";
import { Badge } from "./badge";
import { Button } from "./button";
import { Card } from "./card";
import { Input } from "./input";

describe("Button", () => {
  it("defaults to type=button so it never submits a form by accident", () => {
    expect(renderToStaticMarkup(<Button>Go</Button>)).toContain('type="button"');
  });

  it("renders a loading state with a visible label, aria-busy and aria-disabled", () => {
    const html = renderToStaticMarkup(
      <Button type="submit" loading>
        Save
      </Button>,
    );
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain("Please wait…");
    expect(html).not.toContain(">Save<");
    // Spinner motion is opt-in for users without a reduced-motion preference.
    expect(html).toContain("motion-safe:animate-spin");
  });

  it("uses a different shape for each variant", () => {
    expect(renderToStaticMarkup(<Button variant="primary">A</Button>)).toContain("rounded-lg");
    const secondary = renderToStaticMarkup(<Button variant="secondary">A</Button>);
    expect(secondary).toContain("rounded-md");
    expect(secondary).toContain("border-border-strong");
  });

  it("passes disabled through", () => {
    expect(renderToStaticMarkup(<Button disabled>A</Button>)).toContain("disabled");
  });
});

describe("Input", () => {
  it("associates the label with the input", () => {
    const html = renderToStaticMarkup(<Input label="Email" id="email" name="email" />);
    expect(html).toContain('for="email"');
    expect(html).toContain('id="email"');
    expect(html).toContain(">Email</label>");
  });

  it("generates an id when none is given and keeps label and input linked", () => {
    const html = renderToStaticMarkup(<Input label="Name" />);
    const id = /<input[^>]* id="([^"]+)"/.exec(html)?.[1];
    expect(id).toBeTruthy();
    expect(html).toContain(`for="${id}"`);
  });

  it("marks the field invalid and links the error message when error is set", () => {
    const html = renderToStaticMarkup(<Input label="Email" id="email" error="Enter a valid email" />);
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby="email-error"');
    expect(html).toContain('id="email-error"');
    expect(html).toContain("Enter a valid email");
    expect(html).toContain("Error: ");
  });

  it("is not invalid without an error, and keeps caller attributes", () => {
    const html = renderToStaticMarkup(
      <Input label="Password" id="pw" type="password" required autoComplete="current-password" hint="8+ characters" />,
    );
    expect(html).not.toContain("aria-invalid");
    expect(html).toContain("required");
    expect(html.toLowerCase()).toContain('autocomplete="current-password"');
    expect(html).toContain('aria-describedby="pw-hint"');
  });

  it("never relies on the decorative border token alone for its boundary", () => {
    const html = renderToStaticMarkup(<Input label="A" id="a" />);
    expect(html).toContain("border-border-strong");
    expect(html).toContain("bg-surface");
  });
});

describe("Card and Badge", () => {
  it("Card renders the requested element with tonal depth and no shadow", () => {
    const html = renderToStaticMarkup(<Card as="article">x</Card>);
    expect(html.startsWith("<article")).toBe(true);
    expect(html).not.toContain("shadow");
  });

  it("Badge shows its label text and hides the tone dot from assistive tech", () => {
    const html = renderToStaticMarkup(<Badge tone="primary">Host</Badge>);
    expect(html).toContain("Host");
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("bg-primary");
  });
});

describe("FormError / FormSuccess", () => {
  it("keep their live regions mounted when empty", () => {
    expect(renderToStaticMarkup(<FormError message={null} />)).toContain('role="alert"');
    expect(renderToStaticMarkup(<FormSuccess message={null} />)).toContain('role="status"');
  });

  it("show the message with a text prefix and use semantic tokens", () => {
    const err = renderToStaticMarkup(<FormError message="Nope" />);
    expect(err).toContain("Error: ");
    expect(err).toContain("Nope");
    expect(err).toContain("text-danger");
    const ok = renderToStaticMarkup(<FormSuccess message="Saved" />);
    expect(ok).toContain("Success: ");
    expect(ok).toContain("text-success");
  });
});
