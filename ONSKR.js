(function () {
  function notify(title, subtitle, body) {
    try {
      const text = String(body || "");
      const parts = [];
      for (let i = 0; i < text.length; i += 900) {
        parts.push(text.slice(i, i + 900));
      }
      if (parts.length === 0) parts.push("");

      for (let i = 0; i < Math.min(parts.length, 8); i++) {
        if (typeof $notification !== "undefined") {
          $notification.post(title, subtitle + " #" + (i + 1), parts[i]);
        } else if (typeof $notify !== "undefined") {
          $notify(title, subtitle + " #" + (i + 1), parts[i]);
        } else {
          console.log(title + " | " + subtitle + " #" + (i + 1) + " | " + parts[i]);
        }
      }
    } catch (e) {
      try { console.log("notify error: " + e); } catch (_) {}
    }
  }

  function safeJson(v) {
    try {
      return JSON.stringify(v, null, 2);
    } catch (e) {
      try { return String(v); } catch (_) { return "[unprintable]"; }
    }
  }

  function bytesToText(bytes) {
    try {
      if (!bytes) return "";
      if (typeof TextDecoder !== "undefined") {
        return new TextDecoder("utf-8").decode(bytes);
      }
      let s = "";
      for (let i = 0; i < bytes.length; i++) {
        s += String.fromCharCode(bytes[i]);
      }
      try {
        return decodeURIComponent(escape(s));
      } catch (e) {
        return s;
      }
    } catch (e) {
      return "[bytes decode failed] " + e;
    }
  }

  try {
    const reqUrl =
      typeof $request !== "undefined" && $request && $request.url
        ? $request.url
        : "[no request url]";

    const resp =
      typeof $response !== "undefined" && $response
        ? $response
        : null;

    notify("ONSKR PROBE", "URL", reqUrl);

    if (!resp) {
      notify("ONSKR PROBE", "RESPONSE", "[no $response]");
      $done({});
      return;
    }

    notify("ONSKR PROBE", "STATUS", safeJson(resp.status));
    notify("ONSKR PROBE", "HEADERS", safeJson(resp.headers || {}));
    notify("ONSKR PROBE", "BODY STRING", resp.body === null ? "[null]" : String(resp.body));

    let bodyBytes = null;
    try {
      bodyBytes = resp.bodyBytes || null;
    } catch (e) {}

    if (bodyBytes) {
      const len = bodyBytes.length || 0;
      notify("ONSKR PROBE", "BODY BYTES LEN", String(len));

      const text = bytesToText(bodyBytes);
      notify("ONSKR PROBE", "BODY BYTES TEXT", text);

      $done({ body: text });
      return;
    }

    if (typeof resp.body === "string") {
      $done({ body: resp.body });
      return;
    }

    $done({ body: safeJson(resp) });
  } catch (e) {
    notify("ONSKR PROBE", "ERROR", e && e.message ? e.message : String(e));
    $done({});
  }
})();