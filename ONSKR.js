(function () {
  function notify(title, subtitle, body) {
    try {
      const text = String(body || "");
      const chunks = [];
      for (let i = 0; i < text.length; i += 900) {
        chunks.push(text.slice(i, i + 900));
      }
      if (chunks.length === 0) chunks.push("");

      for (let i = 0; i < Math.min(chunks.length, 6); i++) {
        if (typeof $notification !== "undefined") {
          $notification.post(title, subtitle + " #" + (i + 1), chunks[i]);
        } else if (typeof $notify !== "undefined") {
          $notify(title, subtitle + " #" + (i + 1), chunks[i]);
        } else {
          console.log(title + " | " + subtitle + " #" + (i + 1) + " | " + chunks[i]);
        }
      }
    } catch (e) {
      try { console.log("notify error: " + e); } catch (_) {}
    }
  }

  try {
    const reqUrl = (typeof $request !== "undefined" && $request && $request.url) ? $request.url : "";
    const respBody = (typeof $response !== "undefined" && $response && typeof $response.body === "string") ? $response.body : "";

    notify("ONSKR RAW DEBUG", "URL", reqUrl || "[no url]");
    notify("ONSKR RAW DEBUG", "BODY", respBody || "[empty body]");

    // 直接把原始响应返回，不做任何处理
    $done({ body: respBody });
  } catch (e) {
    notify("ONSKR RAW DEBUG", "ERROR", e && e.message ? e.message : String(e));
    $done({});
  }
})();