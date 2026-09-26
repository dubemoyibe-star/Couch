export type DefaultVisibility = "private" | "public";

/** The create form's starting choice from `?visibility=`. Only exactly "public" selects public; anything else stays private. */
export function parseDefaultVisibility(value: string | string[] | undefined): DefaultVisibility {
  return (Array.isArray(value) ? value[0] : value) === "public" ? "public" : "private";
}
