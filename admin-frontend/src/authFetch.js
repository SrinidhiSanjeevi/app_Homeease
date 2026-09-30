let refreshing = null;

async function refreshTokens(originalFetch) {
  const refreshToken = localStorage.getItem("refreshToken");
  if (!refreshToken) return null;
  try {
    const res = await originalFetch("/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.token) return null;
    localStorage.setItem("token", data.token);
    if (data.refreshToken) localStorage.setItem("refreshToken", data.refreshToken);
    window.dispatchEvent(new CustomEvent("homeease:token", { detail: data.token }));
    return data.token;
  } catch {
    return null;
  }
}

export function installAuthFetch() {
  if (window.__homeeaseAuthFetch) return;
  window.__homeeaseAuthFetch = true;
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input.url;
    const response = await originalFetch(input, init);

    const headers = new Headers(init.headers || {});
    const hadToken = headers.has("Authorization");
    if (response.status !== 401 || !hadToken || !url.includes("/api/") || url.includes("/api/auth/")) {
      return response;
    }

    refreshing = refreshing || refreshTokens(originalFetch).finally(() => { refreshing = null; });
    const newToken = await refreshing;
    if (!newToken) {
      window.dispatchEvent(new CustomEvent("homeease:logout"));
      return response;
    }

    headers.set("Authorization", `Bearer ${newToken}`);
    return originalFetch(input, { ...init, headers });
  };
}
