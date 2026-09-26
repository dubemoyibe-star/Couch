import { describe, expect, it, vi } from "vitest";
import { requestRealtimeTeardown } from "./realtime-teardown";

const base = { url: "http://rt.test:3001/", secret: "test-secret-value" };

describe("requestRealtimeTeardown", () => {
  it("POSTs to the couch teardown path with the secret header and reports ok on 204", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    const result = await requestRealtimeTeardown("couch/1", { ...base, fetch: fetchMock as unknown as typeof fetch });
    expect(result).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://rt.test:3001/internal/couches/couch%2F1/teardown");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "x-internal-secret": "test-secret-value" });
  });

  it("reports the status and an empty body for a bare 500, without the secret", async () => {
    const result = await requestRealtimeTeardown("c", {
      ...base,
      fetch: (async () => new Response(null, { status: 500 })) as typeof fetch,
    });
    expect(result).toEqual({ ok: false, reason: "HTTP 500, body: (empty)" });
    expect(JSON.stringify(result)).not.toContain("test-secret-value");
  });

  it("includes whatever body text exists, trimmed", async () => {
    const result = await requestRealtimeTeardown("c", {
      ...base,
      fetch: (async () => new Response("x".repeat(500), { status: 502 })) as typeof fetch,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason.length).toBeLessThan(260);
  });

  it("reports a network error or timeout instead of throwing", async () => {
    const result = await requestRealtimeTeardown("c", {
      ...base,
      fetch: (async () => {
        throw new TypeError("fetch failed");
      }) as typeof fetch,
    });
    expect(result).toEqual({ ok: false, reason: "TypeError: fetch failed" });
  });

  it("reports missing configuration without calling fetch", async () => {
    const fetchMock = vi.fn();
    const result = await requestRealtimeTeardown("c", {
      url: undefined,
      secret: "x",
      fetch: fetchMock as unknown as typeof fetch,
    });
    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
