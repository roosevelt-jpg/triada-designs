/**
 * Triada Designs embeddable webchat widget (local-ready).
 * Usage:
 *   <script src="https://ops.example.com/widget/chat.js"
 *     data-token="wc_..."
 *     data-api="/api/v1/webchat/messages"></script>
 */
(function () {
  var script = document.currentScript;
  if (!script) return;

  var token = script.getAttribute("data-token") || "";
  var api =
    script.getAttribute("data-api") ||
    (window.TRIADA_WEBCHAT_API || "/api/v1/webchat/messages");
  var title = script.getAttribute("data-title") || "Triada Designs";

  if (!token) {
    console.warn("[Triada webchat] data-token is required");
    return;
  }

  var visitorId =
    localStorage.getItem("triada_wc_vid") ||
    "v_" + Math.random().toString(36).slice(2, 10);
  localStorage.setItem("triada_wc_vid", visitorId);

  var root = document.createElement("div");
  root.setAttribute("data-triada-webchat", "1");
  root.style.cssText =
    "position:fixed;right:16px;bottom:16px;z-index:99999;font-family:Georgia,serif;";

  var panel = document.createElement("div");
  panel.hidden = true;
  panel.style.cssText =
    "width:320px;max-width:calc(100vw - 32px);background:#faf8f4;border:1px solid #e4d9c8;border-radius:12px;box-shadow:0 12px 40px rgba(63,52,43,0.18);overflow:hidden;margin-bottom:10px;";

  panel.innerHTML =
    '<div style="background:#70563f;color:#faf8f4;padding:12px 14px;font-size:15px;">' +
    title +
    ' <span style="opacity:.75;font-size:12px;">assistant</span></div>' +
    '<div data-log style="height:220px;overflow:auto;padding:12px;font-family:system-ui,sans-serif;font-size:13px;color:#3f342b;"></div>' +
    '<form data-form style="display:flex;gap:8px;padding:10px;border-top:1px solid #e4d9c8;">' +
    '<input data-input aria-label="Message" placeholder="Ask about products or services" style="flex:1;border:1px solid #e4d9c8;border-radius:8px;padding:8px 10px;background:#fff;" />' +
    '<button type="submit" style="background:#70563f;color:#fff;border:0;border-radius:8px;padding:8px 12px;cursor:pointer;">Send</button>' +
    "</form>";

  var toggle = document.createElement("button");
  toggle.type = "button";
  toggle.setAttribute("aria-label", "Open chat");
  toggle.textContent = "Chat";
  toggle.style.cssText =
    "background:#70563f;color:#faf8f4;border:0;border-radius:999px;padding:12px 18px;cursor:pointer;font-family:system-ui,sans-serif;";

  toggle.addEventListener("click", function () {
    panel.hidden = !panel.hidden;
    toggle.setAttribute("aria-label", panel.hidden ? "Open chat" : "Close chat");
  });

  var log = panel.querySelector("[data-log]");
  var form = panel.querySelector("[data-form]");
  var input = panel.querySelector("[data-input]");

  function addBubble(text, who) {
    var row = document.createElement("div");
    row.style.margin = "0 0 8px";
    row.innerHTML =
      '<strong style="display:block;font-size:11px;color:#9a7958;">' +
      who +
      "</strong>" +
      '<span>' +
      String(text || "").replace(/</g, "&lt;") +
      "</span>";
    log.appendChild(row);
    log.scrollTop = log.scrollHeight;
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    var body = (input.value || "").trim();
    if (!body) return;
    addBubble(body, "You");
    input.value = "";

    fetch(api, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        token: token,
        body: body,
        visitor_id: visitorId,
      }),
    })
      .then(function (res) {
        return res.json().then(function (json) {
          if (!res.ok) throw new Error(json.message || "Send failed");
          return json;
        });
      })
      .then(function (json) {
        addBubble(
          json.suggested_reply || "Thanks — a Triada specialist can continue from here.",
          "Triada"
        );
      })
      .catch(function (err) {
        addBubble(err.message || "Unable to send right now.", "System");
      });
  });

  root.appendChild(panel);
  root.appendChild(toggle);
  document.body.appendChild(root);
})();
