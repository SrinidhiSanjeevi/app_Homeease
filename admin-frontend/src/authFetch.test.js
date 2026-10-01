import { beforeEach, describe, expect, it, vi } from "vitest";
import { installAuthFetch } from "./authFetch";

// Tiny fake browser: a window with fetch + events, and an in-memory localStorage.
function setupBrowser(fetchMock) {
  const store = {};
  const events = [];
  globalThis.localStorage = {
    getItem: (k) => store[k] ?? null,
    setItem: (k, v) => { store[k] = v; },
  };
  const win = {
    fetch: fetchMock,
    dispatchEvent: (e) => events.push(e),
  };
  win.fetch.bind = () => fetchMock;
  globalThis.window = win;
  return { store, events, win };
}

const json = (status, body) => ({ status, ok: status < 400, json: async () => body });

describe("installAuthFetch", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("passes normal responses straight through", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(200, {}));
    const { win } = setupBrowser(fetchMock);
    installAuthFetch();
    const res = await win.fetch("/api/services");
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("only installs once", () => {
    const { win } = setupBrowser(vi.fn());
    installAuthFetch();
    const first = win.fetch;
    installAuthFetch();
    expect(win.fetch).toBe(first);
  });

  it("refreshes the token on 401 and retries the request", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(401, {}))
      .mockResolvedValueOnce(json(200, { token: "new-token", refreshToken: "new-refresh" }))
      .mockResolvedValueOnce(json(200, { ok: true }));
    const { win, store, events } = setupBrowser(fetchMock);
    store.refreshToken = "old-refresh";
    installAuthFetch();

    const res = await win.fetch("/api/bookings", { headers: { Authorization: "Bearer old" } });

    expect(res.status).toBe(200);
    expect(store.token).toBe("new-token");
    expect(store.refreshToken).toBe("new-refresh");
    expect(events.map((e) => e.type)).toEqual(["homeease:token"]);
    const retryHeaders = fetchMock.mock.calls[2][1].headers;
    expect(retryHeaders.get("Authorization")).toBe("Bearer new-token");
  });

  it("logs out when there is no refresh token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(401, {}));
    const { win, events } = setupBrowser(fetchMock);
    installAuthFetch();

    const res = await win.fetch("/api/bookings", { headers: { Authorization: "Bearer old" } });

    expect(res.status).toBe(401);
    expect(events.map((e) => e.type)).toEqual(["homeease:logout"]);
  });

  it("logs out when the refresh call fails", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(401, {}))
      .mockRejectedValueOnce(new Error("network"));
    const { win, store, events } = setupBrowser(fetchMock);
    store.refreshToken = "old-refresh";
    installAuthFetch();

    await win.fetch("/api/bookings", { headers: { Authorization: "Bearer old" } });

    expect(events.map((e) => e.type)).toEqual(["homeease:logout"]);
  });

  it("does not try to refresh auth endpoints or requests without a token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(401, {}));
    const { win, events } = setupBrowser(fetchMock);
    installAuthFetch();

    await win.fetch("/api/auth/login", { headers: { Authorization: "Bearer x" } });
    await win.fetch({ url: "/api/bookings" });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(events).toHaveLength(0);
  });
});
