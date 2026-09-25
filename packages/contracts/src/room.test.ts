import { describe, expect, it } from "vitest";
import {
  COUCH_ID_MAX_LENGTH,
  COUCH_NAME_MAX_LENGTH,
  DISPLAY_NAME_MAX_LENGTH,
  KICK_REASON_MAX_LENGTH,
  MEDIA_LIMITS,
  ROOM_MEMBERS_MAX,
  USER_ID_MAX_LENGTH,
  clientEvents,
  parseMessage,
  serverEvents,
  type ParseResult,
} from "./index";
import { catalogMedia, license, playbackState, roomState } from "./test-fixtures";

const message = (type: string, payload: unknown, extra: object = {}) =>
  JSON.stringify({ v: 1, type, payload, ...extra });
const parseClient = (type: string, payload: unknown) =>
  parseMessage(message(type, payload), clientEvents);
const parseServer = (type: string, payload: unknown) =>
  parseMessage(message(type, payload), serverEvents);

function code(result: ParseResult<unknown>) {
  if (result.ok) throw new Error("expected ok:false");
  return result.error.code;
}

const member = roomState.members[0]!;
const idCases = (limit: number): [string, unknown][] => [
  ["empty", ""],
  ["leading space", " a"],
  ["trailing space", "a "],
  ["a control character", "a\u0000b"],
  ["a newline", "a\nb"],
  ["over the limit", "a".repeat(limit + 1)],
  ["a number", 5],
  ["null", null],
];

describe("room.join", () => {
  it("round-trips", () => {
    const raw = message("room.join", { couchId: "couch-1" }, { id: "c-1" });
    expect(parseMessage(raw, clientEvents)).toEqual({
      ok: true,
      data: { v: 1, type: "room.join", id: "c-1", payload: { couchId: "couch-1" } },
    });
  });

  it("accepts an id at the limit and an inner space", () => {
    expect(parseClient("room.join", { couchId: "a".repeat(COUCH_ID_MAX_LENGTH) }).ok).toBe(true);
    expect(parseClient("room.join", { couchId: "my couch" }).ok).toBe(true);
  });

  it.each(idCases(COUCH_ID_MAX_LENGTH))("rejects a couchId that is %s", (_name, couchId) => {
    expect(code(parseClient("room.join", { couchId }))).toBe("invalid_payload");
  });

  it.each([
    ["missing couchId", {}],
    ["an extra key", { couchId: "c", role: "host" }],
  ])("rejects %s", (_name, payload) => {
    expect(code(parseClient("room.join", payload))).toBe("invalid_payload");
  });
});

describe("room.leave", () => {
  it("round-trips with an empty payload", () => {
    expect(parseClient("room.leave", {})).toEqual({
      ok: true,
      data: { v: 1, type: "room.leave", payload: {} },
    });
  });

  it.each([
    ["an extra key", { couchId: "c" }],
    ["a null payload", null],
    ["an array payload", []],
    ["a string payload", "x"],
  ])("rejects %s", (_name, payload) => {
    expect(code(parseClient("room.leave", payload))).toBe("invalid_payload");
  });

  it("rejects a missing payload", () => {
    const raw = JSON.stringify({ v: 1, type: "room.leave" });
    expect(code(parseMessage(raw, clientEvents))).toBe("invalid_payload");
  });
});

describe("room.setMedia", () => {
  it("round-trips", () => {
    expect(parseClient("room.setMedia", { mediaId: "cat-1" })).toEqual({
      ok: true,
      data: { v: 1, type: "room.setMedia", payload: { mediaId: "cat-1" } },
    });
  });

  it("accepts null, which clears the media", () => {
    expect(parseClient("room.setMedia", { mediaId: null }).ok).toBe(true);
  });

  it("accepts an id at the catalog id limit", () => {
    const mediaId = "a".repeat(MEDIA_LIMITS.catalogId);
    expect(parseClient("room.setMedia", { mediaId }).ok).toBe(true);
  });

  // null is the one non-string value setMedia accepts: it clears the media.
  it.each(idCases(MEDIA_LIMITS.catalogId).filter(([, value]) => value !== null))("rejects a mediaId that is %s", (_name, mediaId) => {
    expect(code(parseClient("room.setMedia", { mediaId }))).toBe("invalid_payload");
  });

  it.each([
    ["missing mediaId", {}],
    ["a provider id instead", { providerId: "p", providerMediaId: "m" }],
    ["an extra key", { mediaId: "cat-1", position: 0 }],
  ])("rejects %s", (_name, payload) => {
    expect(code(parseClient("room.setMedia", payload))).toBe("invalid_payload");
  });
});

describe("room.kick", () => {
  it("round-trips", () => {
    expect(parseClient("room.kick", { userId: "user-2" })).toEqual({
      ok: true,
      data: { v: 1, type: "room.kick", payload: { userId: "user-2" } },
    });
  });

  it.each(idCases(USER_ID_MAX_LENGTH))("rejects a userId that is %s", (_name, userId) => {
    expect(code(parseClient("room.kick", { userId }))).toBe("invalid_payload");
  });

  it.each([
    ["missing userId", {}],
    ["an extra reason", { userId: "u", reason: "spam" }],
    ["an extra role", { userId: "u", role: "host" }],
  ])("rejects %s", (_name, payload) => {
    expect(code(parseClient("room.kick", payload))).toBe("invalid_payload");
  });
});

describe("room.state", () => {
  const withState = (patch: object) => ({ ...roomState, ...patch });

  it("round-trips a snapshot with media and playback", () => {
    expect(parseServer("room.state", roomState)).toEqual({
      ok: true,
      data: { v: 1, type: "room.state", payload: roomState },
    });
  });

  it.each(["open", "host"])("round-trips playbackAccess %s", (playbackAccess) => {
    const snapshot = withState({ playbackAccess });
    expect(parseServer("room.state", snapshot)).toEqual({
      ok: true,
      data: { v: 1, type: "room.state", payload: snapshot },
    });
  });

  it("round-trips a snapshot with no media and no playback", () => {
    const empty = withState({ media: null, playback: null });
    expect(parseServer("room.state", empty)).toEqual({
      ok: true,
      data: { v: 1, type: "room.state", payload: empty },
    });
  });

  it("keeps the invariant on valid examples: media is null exactly when playback is null", () => {
    const examples = [roomState, withState({ media: null, playback: null })];
    for (const example of examples) {
      expect(example.media === null).toBe(example.playback === null);
      const parsed = parseServer("room.state", example);
      if (!parsed.ok) throw new Error("expected ok:true");
      const { media, playback } = parsed.data.payload as typeof roomState;
      expect(media === null).toBe(playback === null);
    }
  });

  it("does not enforce the invariant in the schema", () => {
    expect(parseServer("room.state", withState({ playback: null })).ok).toBe(true);
    expect(parseServer("room.state", withState({ media: null })).ok).toBe(true);
  });

  it("accepts an empty member list and exactly ROOM_MEMBERS_MAX members", () => {
    expect(parseServer("room.state", withState({ members: [] })).ok).toBe(true);
    const members = Array.from({ length: ROOM_MEMBERS_MAX }, (_, i) => ({ ...member, userId: `u${i}` }));
    expect(parseServer("room.state", withState({ members })).ok).toBe(true);
  });

  it("rejects more than ROOM_MEMBERS_MAX members", () => {
    const members = Array.from({ length: ROOM_MEMBERS_MAX + 1 }, (_, i) => ({ ...member, userId: `u${i}` }));
    expect(code(parseServer("room.state", withState({ members })))).toBe("invalid_payload");
  });

  it.each<[string, object]>([
    ["a missing couch", { couch: undefined }],
    ["a missing self", { self: undefined }],
    ["a missing members list", { members: undefined }],
    ["a missing media key", { media: undefined }],
    ["a missing playback key", { playback: undefined }],
    ["an empty couch name", { couch: { id: "c", name: "   " } }],
    ["a couch name over the limit", { couch: { id: "c", name: "a".repeat(COUCH_NAME_MAX_LENGTH + 1) } }],
    ["a padded couch id", { couch: { id: " c", name: "n" } }],
    ["an unknown self role", { self: { userId: "u", role: "admin" } }],
    ["a self without a role", { self: { userId: "u" } }],
    ["members that is not an array", { members: {} }],
    ["media that is not a catalog item", { media: { ...catalogMedia, license: undefined } }],
    ["playback with a bad status", { playback: { ...playbackState, status: "buffering" } }],
    ["a missing playbackAccess", { playbackAccess: undefined }],
    ["a null playbackAccess", { playbackAccess: null }],
    ["an unknown playbackAccess mode", { playbackAccess: "everyone" }],
    ["a wrong-case playbackAccess mode", { playbackAccess: "Host" }],
  ])("rejects %s", (_name, patch) => {
    expect(code(parseServer("room.state", withState(patch)))).toBe("invalid_payload");
  });

  it.each<[string, object]>([
    ["an empty displayName", { displayName: "  " }],
    ["a displayName over the limit", { displayName: "a".repeat(DISPLAY_NAME_MAX_LENGTH + 1) }],
    ["an unknown role", { role: "owner" }],
    ["a non-boolean online", { online: "yes" }],
    ["a missing online", { online: undefined }],
    ["an empty userId", { userId: "" }],
    ["an over-long userId", { userId: "a".repeat(USER_ID_MAX_LENGTH + 1) }],
  ])("rejects a member with %s", (_name, patch) => {
    const members = [{ ...member, ...patch }];
    expect(code(parseServer("room.state", withState({ members })))).toBe("invalid_payload");
  });

  it("trims a displayName and accepts one at the limit", () => {
    const padded = [{ ...member, displayName: `  ${"a".repeat(DISPLAY_NAME_MAX_LENGTH)}  ` }];
    const parsed = parseServer("room.state", withState({ members: padded }));
    if (!parsed.ok) throw new Error("expected ok:true");
    const { members } = parsed.data.payload as typeof roomState;
    expect(members[0]!.displayName).toBe("a".repeat(DISPLAY_NAME_MAX_LENGTH));
  });

  it("strips unknown keys at every nested level", () => {
    const noisy = {
      ...roomState,
      extra: 1,
      couch: { ...roomState.couch, extra: 1 },
      self: { ...roomState.self, extra: 1 },
      members: roomState.members.map((each) => ({ ...each, extra: 1 })),
      media: { ...catalogMedia, extra: 1, license: { ...license, extra: 1 } },
      playback: { ...playbackState, extra: 1 },
    };
    expect(parseServer("room.state", noisy)).toEqual({
      ok: true,
      data: { v: 1, type: "room.state", payload: roomState },
    });
  });
});

describe("room.mediaChanged", () => {
  const valid = { media: catalogMedia, playback: playbackState };

  it("round-trips", () => {
    expect(parseServer("room.mediaChanged", valid)).toEqual({
      ok: true,
      data: { v: 1, type: "room.mediaChanged", payload: valid },
    });
  });

  it("accepts a cleared room: media and playback both null", () => {
    const cleared = { media: null, playback: null };
    expect(parseServer("room.mediaChanged", cleared)).toEqual({
      ok: true,
      data: { v: 1, type: "room.mediaChanged", payload: cleared },
    });
  });

  it.each<[string, object]>([
    ["missing media", { media: undefined }],
    ["missing playback", { playback: undefined }],
    ["media without a license", { media: { ...catalogMedia, license: undefined } }],
    ["media with an http poster", { media: { ...catalogMedia, posterUrl: "http://example.com/p.png" } }],
    ["a negative revision", { playback: { ...playbackState, revision: -1 } }],
  ])("rejects %s", (_name, patch) => {
    expect(code(parseServer("room.mediaChanged", { ...valid, ...patch }))).toBe("invalid_payload");
  });
});

describe("room.memberJoined", () => {
  const joined = { userId: "user-3", displayName: "Linus", role: "participant", online: true };

  it("round-trips", () => {
    expect(parseServer("room.memberJoined", { member: joined })).toEqual({
      ok: true,
      data: { v: 1, type: "room.memberJoined", payload: { member: joined } },
    });
  });

  it("accepts a host and an offline member", () => {
    const host = { ...joined, role: "host", online: false };
    expect(parseServer("room.memberJoined", { member: host }).ok).toBe(true);
  });

  it("strips unknown keys, at the payload and member level", () => {
    const noisy = { extra: 1, member: { ...joined, extra: 1 } };
    expect(parseServer("room.memberJoined", noisy)).toEqual({
      ok: true,
      data: { v: 1, type: "room.memberJoined", payload: { member: joined } },
    });
  });

  it.each<[string, unknown]>([
    ["a missing member", {}],
    ["a null member", { member: null }],
    ["a member without a role", { member: { ...joined, role: undefined } }],
    ["a member with an unknown role", { member: { ...joined, role: "owner" } }],
    ["a member with a string online", { member: { ...joined, online: "yes" } }],
    ["a member without online", { member: { ...joined, online: undefined } }],
    ["a member with an empty displayName", { member: { ...joined, displayName: " " } }],
    [
      "a member with a displayName over the limit",
      { member: { ...joined, displayName: "a".repeat(DISPLAY_NAME_MAX_LENGTH + 1) } },
    ],
    ["a member with a padded userId", { member: { ...joined, userId: " user-3" } }],
    ["the member fields at the top level", joined],
  ])("rejects %s", (_name, payload) => {
    expect(code(parseServer("room.memberJoined", payload))).toBe("invalid_payload");
  });

  it("cannot be sent by a client", () => {
    expect(code(parseClient("room.memberJoined", { member: joined }))).toBe("unknown_type");
  });
});

describe("room.memberLeft", () => {
  it("round-trips", () => {
    expect(parseServer("room.memberLeft", { userId: "user-2" })).toEqual({
      ok: true,
      data: { v: 1, type: "room.memberLeft", payload: { userId: "user-2" } },
    });
  });

  it("strips an unknown key", () => {
    expect(parseServer("room.memberLeft", { userId: "user-2", reason: "kicked" })).toEqual({
      ok: true,
      data: { v: 1, type: "room.memberLeft", payload: { userId: "user-2" } },
    });
  });

  it.each(idCases(USER_ID_MAX_LENGTH))("rejects a userId that is %s", (_name, userId) => {
    expect(code(parseServer("room.memberLeft", { userId }))).toBe("invalid_payload");
  });

  it("rejects a missing userId", () => {
    expect(code(parseServer("room.memberLeft", {}))).toBe("invalid_payload");
  });

  it("cannot be sent by a client", () => {
    expect(code(parseClient("room.memberLeft", { userId: "user-2" }))).toBe("unknown_type");
  });
});

describe("single-line labels: displayName and couch name", () => {
  const withMember = (displayName: string) => ({
    ...roomState,
    members: [{ ...member, displayName }],
  });
  const withCouchName = (name: string) => ({ ...roomState, couch: { id: "couch-1", name } });
  const joinedWith = (displayName: string) => ({ member: { ...member, displayName } });

  const controls: [string, string][] = [
    ["a newline inside", "a\nb"],
    ["a tab inside", "a\tb"],
    ["a carriage return inside", "a\rb"],
    ["a NUL inside", "a\u0000b"],
    ["an escape character inside", "a\u001bb"],
    ["DEL inside", "a\u007fb"],
    ["a newline at the edge", "name\n"],
    ["a tab at the edge", "\tname"],
  ];

  it.each(controls)("rejects a displayName with %s", (_name, displayName) => {
    expect(code(parseServer("room.state", withMember(displayName)))).toBe("invalid_payload");
    expect(code(parseServer("room.memberJoined", joinedWith(displayName)))).toBe("invalid_payload");
  });

  it.each(controls)("rejects a couch name with %s", (_name, name) => {
    expect(code(parseServer("room.state", withCouchName(name)))).toBe("invalid_payload");
  });

  it("still trims spaces and keeps spaces, non-ASCII text and other Unicode inside a name", () => {
    const name = "  Zoë 中文 \u{1F600}‍\u{1F600}  ";
    const parsed = parseServer("room.state", { ...withMember(name), couch: { id: "c", name } });
    if (!parsed.ok) throw new Error("expected ok:true");
    const payload = parsed.data.payload as typeof roomState;
    expect(payload.members[0]!.displayName).toBe(name.trim());
    expect(payload.couch.name).toBe(name.trim());
  });
});

describe("presence.update", () => {
  it("round-trips", () => {
    expect(parseServer("presence.update", { userId: "user-2", online: false })).toEqual({
      ok: true,
      data: { v: 1, type: "presence.update", payload: { userId: "user-2", online: false } },
    });
  });

  it.each<[string, unknown]>([
    ["a missing online", { userId: "u" }],
    ["a string online", { userId: "u", online: "true" }],
    ["a missing userId", { online: true }],
    ["an empty userId", { userId: "", online: true }],
    ["a padded userId", { userId: "u ", online: true }],
    ["an over-long userId", { userId: "a".repeat(USER_ID_MAX_LENGTH + 1), online: true }],
  ])("rejects %s", (_name, payload) => {
    expect(code(parseServer("presence.update", payload))).toBe("invalid_payload");
  });

  it("cannot be sent by a client", () => {
    const result = parseClient("presence.update", { userId: "u", online: true });
    expect(code(result)).toBe("unknown_type");
  });
});

describe("room.kicked", () => {
  it("round-trips with and without a reason", () => {
    expect(parseServer("room.kicked", {})).toEqual({
      ok: true,
      data: { v: 1, type: "room.kicked", payload: {} },
    });
    expect(parseServer("room.kicked", { reason: "Removed by the host" })).toEqual({
      ok: true,
      data: { v: 1, type: "room.kicked", payload: { reason: "Removed by the host" } },
    });
  });

  it("trims the reason and accepts one at the limit", () => {
    const reason = "a".repeat(KICK_REASON_MAX_LENGTH);
    expect(parseServer("room.kicked", { reason: `  ${reason} ` }).ok).toBe(true);
  });

  it.each<[string, unknown]>([
    ["an empty reason", { reason: "" }],
    ["a blank reason", { reason: "   " }],
    ["a reason over the limit", { reason: "a".repeat(KICK_REASON_MAX_LENGTH + 1) }],
    ["a number reason", { reason: 5 }],
    ["a null reason", { reason: null }],
  ])("rejects %s", (_name, payload) => {
    expect(code(parseServer("room.kicked", payload))).toBe("invalid_payload");
  });
});
