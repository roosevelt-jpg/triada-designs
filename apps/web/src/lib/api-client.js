const TOKEN_KEY = "triada_api_token";

export function getApiBase() {
  return process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8088/api";
}

export function getStoredToken() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

/** @param {string|null} token */
export function setStoredToken(token) {
  if (typeof window === "undefined") return;
  if (!token) window.localStorage.removeItem(TOKEN_KEY);
  else window.localStorage.setItem(TOKEN_KEY, token);
}

/**
 * @param {string} path
 * @param {{ method?: string, body?: unknown, token?: string|null, auth?: boolean }} [options]
 */
export async function apiFetch(path, options = {}) {
  const { method = "GET", body, token, auth = true } = options;
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };

  const authToken = token ?? (auth ? getStoredToken() : null);
  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  const response = await fetch(`${getApiBase()}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { message: text || "Unexpected response" };
  }

  if (!response.ok) {
    const error = new Error(data?.message || `Request failed (${response.status})`);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}
