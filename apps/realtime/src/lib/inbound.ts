import {
  MAX_CLIENT_MESSAGE_BYTES,
  PROTOCOL_VERSION,
  clientEvents,
  parseMessage,
  type ClientMessage,
  type ParseError,
} from "@couch/contracts";

// The socket layer drops a frame larger than this before it is buffered whole,
// and closes the connection with code 1009. It is deliberately larger than
// MAX_CLIENT_MESSAGE_BYTES: ws cannot send anything once it has rejected a
// frame, so a frame at exactly the cap would end the connection with no
// message_too_large reply. With the headroom, a message over the cap but under
// this limit reaches parseMessage, which answers with the contract's error and
// keeps the connection open. Anything larger is refused by the socket, so
// buffering per message stays bounded at twice the contract cap.
export const MAX_FRAME_BYTES = MAX_CLIENT_MESSAGE_BYTES * 2;

export type ErrorReply = {
  v: typeof PROTOCOL_VERSION;
  type: "error";
  payload: ParseError;
};

export type InboundResult =
  { ok: true; message: ClientMessage } | { ok: false; reply: ErrorReply };

function errorReply(error: ParseError): ErrorReply {
  return { v: PROTOCOL_VERSION, type: "error", payload: error };
}

// Turns one received frame into a parsed client message or the contract's
// error reply. Pure: no socket, no identity. Who sent the message is never
// read from it (see the per-connection state in server.ts).
export function interpretFrame(data: Uint8Array, isBinary: boolean): InboundResult {
  // The contract is JSON text. A binary frame is not a message.
  if (isBinary) {
    return {
      ok: false,
      reply: errorReply({ code: "invalid_json", message: "Binary messages are not supported." }),
    };
  }
  // Stage 1 of parseMessage measures bytes, so decoding a frame that already
  // passed the socket limit is bounded work. Invalid UTF-8 never gets here:
  // ws refuses it and closes the connection.
  const result = parseMessage(new TextDecoder().decode(data), clientEvents);
  return result.ok ? { ok: true, message: result.data } : { ok: false, reply: errorReply(result.error) };
}
