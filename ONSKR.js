// ONSKR-wrapper.js
// 用法：把 script-path 指向这份脚本；它会先注入调试钩子，再加载并执行原始混淆脚本。

(function () {
  const ORIGINAL_SCRIPT_URL = "https://raw.githubusercontent.com/bigyvc/surge/refs/heads/main/ONSKR.js";

  function isQuanX() {
    return typeof $task !== "undefined";
  }

  function isSurgeLike() {
    return typeof $httpClient !== "undefined";
  }

  function notify(title, subtitle, body) {
    try {
      const text = String(body || "");
      const trimmed = text.length > 1800 ? text.slice(0, 1800) : text;
      if (typeof $notification !== "undefined") {
        $notification.post(title, subtitle, trimmed);
      } else if (typeof $notify !== "undefined") {
        $notify(title, subtitle, trimmed);
      } else {
        console.log(title + " | " + subtitle + " | " + trimmed);
      }
    } catch (e) {
      try { console.log("notify error: " + e); } catch (_) {}
    }
  }

  function safeString(v) {
    try {
      if (typeof v === "string") return v;
      return JSON.stringify(v);
    } catch (e) {
      try { return String(v); } catch (_) { return "[unprintable]"; }
    }
  }

  // 防止重复通知刷屏
  const onceFlags = Object.create(null);
  function notifyOnce(key, title, subtitle, body) {
    if (onceFlags[key]) return;
    onceFlags[key] = true;
    notify(title, subtitle, body);
  }

  // 1) 钩住 JSON.parse，尽量抓解密后的明文 JSON
  try {
    const _jsonParse = JSON.parse;
    JSON.parse = function (s, ...args) {
      try {
        const text = typeof s === "string" ? s : String(s);
        const hit =
          text.includes('"lines"') ||
          text.includes('"title"') ||
          text.includes('"ip"') ||
          text.includes('"port"') ||
          text.includes('"password"') ||
          text.includes('"encrypt"') ||
          text.includes('"server"') ||
          text.includes('"server_port"') ||
          text.includes('"method"');

        if (hit) {
          notifyOnce(
            "json_parse_input",
            "ONSKR DEBUG",
            "JSON_PARSE_INPUT",
            text
          );
        }
      } catch (e) {}
      return _jsonParse.call(this, s, ...args);
    };
  } catch (e) {
    notify("ONSKR DEBUG", "HOOK JSON.parse FAIL", safeString(e));
  }

  // 2) 钩住 $done，方便看最终输出
  try {
    if (typeof $done === "function") {
      const _done = $done;
      $done = function (obj) {
        try {
          if (obj && typeof obj.body === "string") {
            notifyOnce("done_body", "ONSKR DEBUG", "DONE BODY", obj.body);
          } else if (obj && obj.url) {
            notifyOnce("done_url", "ONSKR DEBUG", "DONE URL", obj.url);
          } else {
            notifyOnce("done_obj", "ONSKR DEBUG", "DONE OBJ", safeString(obj));
          }
        } catch (e) {}
        return _done(obj);
      };
    }
  } catch (e) {
    notify("ONSKR DEBUG", "HOOK $done FAIL", safeString(e));
  }

  // 3) 轮询等待 CryptoJS 出现，再钩住 AES.decrypt
  (function hookCrypto() {
    let tries = 0;
    const timer = setInterval(() => {
      tries++;
      try {
        if (
          typeof CryptoJS !== "undefined" &&
          CryptoJS &&
          CryptoJS.AES &&
          typeof CryptoJS.AES.decrypt === "function"
        ) {
          clearInterval(timer);

          const _decrypt = CryptoJS.AES.decrypt;
          CryptoJS.AES.decrypt = function (cipherParams, key, opts) {
            try {
              notifyOnce("aes_called", "ONSKR DEBUG", "AES_DECRYPT_CALLED", "AES.decrypt 已触发");

              try {
                if (cipherParams && cipherParams.ciphertext && CryptoJS.enc && CryptoJS.enc.Hex) {
                  notifyOnce(
                    "cipher_hex",
                    "ONSKR DEBUG",
                    "CIPHERTEXT_HEX",
                    cipherParams.ciphertext.toString(CryptoJS.enc.Hex)
                  );
                }
              } catch (e) {}

              try {
                if (key && typeof key.toString === "function") {
                  notifyOnce("key_hex", "ONSKR DEBUG", "KEY_HEX", key.toString());
                }
              } catch (e) {}

              try {
                if (opts && opts.iv && typeof opts.iv.toString === "function") {
                  notifyOnce("iv_hex", "ONSKR DEBUG", "IV_HEX", opts.iv.toString());
                }
              } catch (e) {}
            } catch (e) {}

            const ret = _decrypt.apply(this, arguments);

            try {
              if (ret && CryptoJS.enc && CryptoJS.enc.Utf8) {
                const plain = ret.toString(CryptoJS.enc.Utf8);
                if (plain) {
                  notifyOnce("plaintext_utf8", "ONSKR DEBUG", "PLAINTEXT_UTF8", plain);

                  // 如果是 JSON，再拆几条字段看看
                  try {
                    const parsed = JSON.parse(plain);
                    notifyOnce("parsed_json", "ONSKR DEBUG", "PARSED JSON", JSON.stringify(parsed));

                    if (parsed && parsed.data && Array.isArray(parsed.data.lines)) {
                      const preview = parsed.data.lines.slice(0, 8).map((x, idx) => {
                        return (
                          idx + ": " +
                          JSON.stringify({
                            title: x && x.title,
                            ip: x && x.ip,
                            port: x && x.port,
                            password: x && x.password,
                            encrypt: x && x.encrypt,
                            server: x && x.server,
                            server_port: x && x.server_port,
                            method: x && x.method,
                            pwd: x && x.pwd
                          })
                        );
                      }).join("\n");
                      notifyOnce("lines_preview", "ONSKR DEBUG", "LINES PREVIEW", preview);
                    }
                  } catch (e) {}
                } else {
                  notifyOnce("plaintext_empty", "ONSKR DEBUG", "PLAINTEXT_UTF8", "[empty]");
                }
              }
            } catch (e) {
              notifyOnce("plaintext_fail", "ONSKR DEBUG", "PLAINTEXT FAIL", safeString(e));
            }

            return ret;
          };

          notifyOnce("hook_aes_ok", "ONSKR DEBUG", "HOOK AES OK", "已成功钩住 CryptoJS.AES.decrypt");
        } else if (tries === 200) {
          clearInterval(timer);
          notifyOnce("hook_aes_timeout", "ONSKR DEBUG", "HOOK AES TIMEOUT", "等待 CryptoJS 超时");
        }
      } catch (e) {
        clearInterval(timer);
        notifyOnce("hook_aes_err", "ONSKR DEBUG", "HOOK AES ERROR", safeString(e));
      }
    }, 50);
  })();

  // 4) 下载并执行原始混淆脚本
  function fetchText(url, cb) {
    if (isQuanX()) {
      $task.fetch({ url }).then(
        (resp) => cb(null, resp && resp.body ? resp.body : ""),
        (err) => cb(err || "fetch failed")
      );
    } else if (isSurgeLike()) {
      $httpClient.get({ url }, (err, resp, body) => cb(err, body));
    } else {
      cb("unsupported environment");
    }
  }

  fetchText(ORIGINAL_SCRIPT_URL, function (err, code) {
    if (err) {
      notify("ONSKR DEBUG", "LOAD ORIGINAL FAIL", safeString(err));
      if (typeof $done === "function") {
        $done({});
      }
      return;
    }

    try {
      notifyOnce("orig_load_ok", "ONSKR DEBUG", "LOAD ORIGINAL OK", ORIGINAL_SCRIPT_URL);
      eval(code);
    } catch (e) {
      notify("ONSKR DEBUG", "EVAL ORIGINAL FAIL", safeString(e));
      if (typeof $done === "function") {
        $done({});
      }
    }
  });
})();