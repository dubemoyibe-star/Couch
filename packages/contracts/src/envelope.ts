import * as z from "zod";

/** Protocol version stamped on every envelope. Bump only on a breaking change. */
export const PROTOCOL_VERSION = 1;

/** Versions the parser accepts. Step 4 of parseMessage checks against this. */
export const SUPPORTED_VERSIONS: readonly number[] = [PROTOCOL_VERSION];

/** Cap for the client-generated correlation id (a UUID is 36 characters). */
export const MAX_ID_LENGTH = 64;

/**
 * "client": client to server. Commands from an untrusted sender, so unknown keys are rejected.
 * "server": server to client. Facts, so unknown keys are stripped to keep old clients working.
 */
export type Direction = "client" | "server";

// domain.action: a lowercase-letters domain, one dot, and a camelCase action that starts
// with a lowercase letter. Matching is case-sensitive. "error" is the single reserved exception.
const TYPE_PATTERN = /^[a-z]+\.[a-z][a-zA-Z0-9]*$/;
const ERROR_TYPE = "error";

export const idSchema = z.string().min(1).max(MAX_ID_LENGTH);

type PayloadSchema<TShape extends z.core.$ZodShape> = z.ZodObject<
  TShape,
  z.core.$strict | z.core.$strip
>;

type EnvelopeSchema<TType extends string, TPayload extends z.ZodType> = z.ZodObject<
  {
    v: z.ZodLiteral<typeof PROTOCOL_VERSION>;
    type: z.ZodLiteral<TType>;
    id: z.ZodOptional<z.ZodString>;
    payload: TPayload;
  },
  z.core.$strict | z.core.$strip
>;

/** What every event definition exposes, whatever its type string, shape or direction. */
export interface AnyEvent {
  readonly type: string;
  readonly direction: Direction;
  readonly envelope: z.ZodType;
}

export interface EventDefinition<
  TType extends string,
  TDirection extends Direction,
  TShape extends z.core.$ZodShape,
> extends AnyEvent {
  readonly type: TType;
  readonly direction: TDirection;
  readonly payload: PayloadSchema<TShape>;
  readonly envelope: EnvelopeSchema<TType, PayloadSchema<TShape>>;
}

/** The parsed message type of an event definition. */
export type MessageOf<TEvent extends AnyEvent> = z.output<TEvent["envelope"]>;

/**
 * Declares an event: a type string, a payload shape and a direction.
 *
 * The payload is given as a shape (the argument of z.object) rather than as a finished
 * schema, so the builder owns the object schema and applies the direction's rule to it:
 * strict for "client", strip for "server". A payload is therefore always an object, which
 * is what lets it grow new optional fields later. Nested objects follow the schema the
 * author writes, so use z.strictObject inside client payloads.
 */
export function defineEvent<
  const TType extends string,
  const TDirection extends Direction,
  TShape extends z.core.$ZodShape,
>(definition: {
  type: TType;
  direction: TDirection;
  payload: TShape;
}): EventDefinition<TType, TDirection, TShape> {
  const { type, direction, payload: shape } = definition;
  if (type !== ERROR_TYPE && !TYPE_PATTERN.test(type)) {
    // A programmer error at module load, never a reaction to wire input.
    throw new Error(`Invalid event type "${type}": use a lowercase domain and a camelCase action (domain.actionName)`);
  }
  const strict = direction === "client";
  const payload: PayloadSchema<TShape> = strict ? z.strictObject(shape) : z.object(shape);
  const fields = {
    v: z.literal(PROTOCOL_VERSION),
    type: z.literal(type),
    id: idSchema.optional(),
    payload,
  };
  const envelope: EnvelopeSchema<TType, PayloadSchema<TShape>> = strict
    ? z.strictObject(fields)
    : z.object(fields);
  return { type, direction, payload, envelope };
}
