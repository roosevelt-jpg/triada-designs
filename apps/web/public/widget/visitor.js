/**
 * Triada Designs first-party visitor → CRM lead tracker.
 * Embed on triada-designs.com (and public dashboard pages):
 *
 *   <script
 *     src="https://dashboard.triada-designs.com/widget/visitor.js"
 *     data-api="https://dashboard.triada-designs.com/api/v1/visitors/capture"
 *     data-token="wc_..."
 *     defer></script>
 *
 * Optional hooks:
 *   window.TriadaVisitor.identify({ email, name, phone })
 *   window.TriadaVisitor.capture({ email })  // force refresh
 */
(function () {
  var script = document.currentScript;
  if (!script) return;

  var api =
    script.getAttribute("data-api") ||
    window.TRIADA_VISITOR_API ||
    "/api/v1/visitors/capture";
  var token =
    script.getAttribute("data-token") ||
    window.TRIADA_WEBCHAT_TOKEN ||
    window.TRIADA_VISITOR_TOKEN ||
    "";
  var source =
    script.getAttribute("data-source") ||
    "website";

  function readCookie(name) {
    try {
      var parts = ("; " + document.cookie).split("; " + name + "=");
      if (parts.length === 2) {
        return decodeURIComponent(parts.pop().split(";").shift() || "") || null;
      }
    } catch (e) {
      /* ignore */
    }
    return null;
  }

  function visitorId() {
    var key = "triada_visitor_id";
    var existing = null;
    try {
      existing = localStorage.getItem(key) || localStorage.getItem("triada_wc_vid");
    } catch (e) {
      existing = null;
    }
    if (!existing) {
      existing =
        "v_" +
        Math.random().toString(36).slice(2, 10) +
        Date.now().toString(36).slice(-4);
    }
    try {
      localStorage.setItem(key, existing);
      localStorage.setItem("triada_wc_vid", existing);
    } catch (e2) {
      /* private mode */
    }
    return existing;
  }

  function utmFromLocation() {
    var params;
    try {
      params = new URLSearchParams(window.location.search || "");
    } catch (e) {
      return {};
    }
    return {
      utm_source: params.get("utm_source") || undefined,
      utm_medium: params.get("utm_medium") || undefined,
      utm_campaign: params.get("utm_campaign") || undefined,
      utm_term: params.get("utm_term") || undefined,
      utm_content: params.get("utm_content") || undefined,
    };
  }

  function sessionKey(vid) {
    return "triada_visitor_captured:" + (vid || "anon");
  }

  function alreadyCaptured(vid) {
    try {
      return sessionStorage.getItem(sessionKey(vid)) === "1";
    } catch (e) {
      return false;
    }
  }

  function markCaptured(vid) {
    try {
      sessionStorage.setItem(sessionKey(vid), "1");
    } catch (e) {
      /* ignore */
    }
  }

  function buildPayload(extra) {
    var vid = visitorId();
    var utm = utmFromLocation();
    var payload = {
      visitor_id: vid,
      page: String(window.location.href || ""),
      referrer: String(document.referrer || "") || null,
      source: source,
      token: token || undefined,
      utm_source: utm.utm_source,
      utm_medium: utm.utm_medium,
      utm_campaign: utm.utm_campaign,
      utm_term: utm.utm_term,
      utm_content: utm.utm_content,
    };
    if (extra && typeof extra === "object") {
      for (var key in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, key) && extra[key] != null) {
          payload[key] = extra[key];
        }
      }
    }
    return payload;
  }

  function postCapture(payload, opts) {
    opts = opts || {};
    var force = Boolean(opts.force);
    var vid = payload.visitor_id;
    if (!force && !payload.email && alreadyCaptured(vid)) {
      return Promise.resolve({ ok: true, skipped: true });
    }

    return fetch(api, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
      mode: "cors",
      credentials: "omit",
      keepalive: true,
    })
      .then(function (res) {
        return res.json().then(function (json) {
          if (!res.ok) {
            throw new Error((json && json.message) || "Capture failed");
          }
          markCaptured(vid);
          return json;
        });
      })
      .catch(function (err) {
        if (window.console && console.warn) {
          console.warn("[Triada visitor]", err && err.message ? err.message : err);
        }
        return { ok: false, error: String((err && err.message) || err) };
      });
  }

  function capture(extra, opts) {
    return postCapture(buildPayload(extra || {}), opts || {});
  }

  function identify(fields) {
    fields = fields || {};
    var email = fields.email || fields.contact_email || null;
    if (!email) {
      return Promise.resolve({ ok: false, message: "email required" });
    }
    return capture(
      {
        email: email,
        name: fields.name || fields.contact_name || null,
        phone: fields.phone || fields.contact_phone || null,
        source: fields.source || source,
      },
      { force: true },
    );
  }

  // Auto pageview once per tab session (plus force on identify).
  capture();

  // Soft hooks: common newsletter / lead form email fields submit.
  function bindFormHooks() {
    document.addEventListener(
      "submit",
      function (event) {
        var form = event.target;
        if (!form || !form.querySelector) return;
        // Skip auth / password forms (ops login) — only marketing-style captures.
        if (form.querySelector('input[type="password"]')) return;
        var emailInput =
          form.querySelector('input[type="email"]') ||
          form.querySelector('input[name*="email"]') ||
          form.querySelector('input[id*="email"]');
        if (!emailInput || !emailInput.value) return;
        var nameInput =
          form.querySelector('input[name*="name"]') ||
          form.querySelector('input[id*="name"]');
        identify({
          email: emailInput.value,
          name: nameInput && nameInput.value ? nameInput.value : null,
          source: source === "website" ? "popup" : source,
        });
        try {
          localStorage.setItem(
            "triada_visitor_email",
            String(emailInput.value).trim(),
          );
        } catch (e) {
          /* ignore */
        }
      },
      true,
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindFormHooks);
  } else {
    bindFormHooks();
  }

  window.TriadaVisitor = {
    capture: capture,
    identify: identify,
    visitorId: visitorId,
    version: "1",
  };

  // Prefer known email from prior identify (local hint only).
  try {
    var savedEmail = localStorage.getItem("triada_visitor_email");
    if (savedEmail) {
      /* already identified previously — refresh attribution quietly */
      capture({ email: savedEmail }, { force: false });
    }
  } catch (e3) {
    /* ignore */
  }

  void readCookie;
})();
