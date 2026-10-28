/**
 * Load Google Maps JavaScript API (places library) once per page.
 * @param {string} apiKey
 * @returns {Promise<typeof window.google>}
 */

const CALLBACK = "__triadaGoogleMapsReady";

/** @type {Promise<typeof window.google>|null} */
let pending = null;

export function loadGoogleMaps(apiKey) {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google Maps is browser-only."));
  }
  const key = String(apiKey || "").trim();
  if (!key) {
    return Promise.reject(new Error("Google Places API key is missing."));
  }

  if (window.google?.maps?.places) {
    return Promise.resolve(window.google);
  }

  if (pending) return pending;

  pending = new Promise((resolve, reject) => {
    const existing = document.querySelector("script[data-triada-google-maps]");
    if (existing) {
      const started = Date.now();
      const poll = () => {
        if (window.google?.maps?.places) {
          resolve(window.google);
          return;
        }
        if (Date.now() - started > 20000) {
          pending = null;
          reject(new Error("Timed out loading Google Maps."));
          return;
        }
        window.setTimeout(poll, 50);
      };
      poll();
      return;
    }

    window[CALLBACK] = () => {
      try {
        delete window[CALLBACK];
      } catch {
        window[CALLBACK] = undefined;
      }
      if (window.google?.maps?.places) {
        resolve(window.google);
      } else {
        pending = null;
        reject(new Error("Google Maps loaded without Places library."));
      }
    };

    const script = document.createElement("script");
    script.dataset.triadaGoogleMaps = "1";
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places&callback=${CALLBACK}`;
    script.onerror = () => {
      pending = null;
      reject(new Error("Failed to load Google Maps script."));
    };
    document.head.appendChild(script);
  });

  return pending;
}
