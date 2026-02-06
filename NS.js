/**
 * NS论坛签到 - Surge / Loon / Shadowrocket 通用版
 * 2026.02.06
 *
 * 需要配置：
 * - rewrite 捕获 header：^https:\/\/www\.nodeseek\.com\/api\/account\/getInfo\/\d+\?readme=1.*$
 * - cron 定时签到：例如 1 0 * * *
 * - MITM: www.nodeseek.com
 */

function main() {
  const NS_HEADER_KEY = "NS_NodeseekHeaders";
  const NS_UID_KEY = "NS_NodeseekUID";
  const isGetHeader = typeof $request !== "undefined";

  // ========== ENV ADAPTER ==========
  const Env = (() => {
    const isSurge = typeof $httpClient !== "undefined" && typeof $persistentStore !== "undefined";
    const isLoon = typeof $httpClient !== "undefined" && typeof $loon !== "undefined";
    const isQX = typeof $task !== "undefined" && typeof $prefs !== "undefined";
    const isSR = typeof $task !== "undefined" && typeof $prefs !== "undefined" && !isQX; // SR 也长得像 QX

    function read(key) {
      if (typeof $persistentStore !== "undefined") return $persistentStore.read(key);
      if (typeof $prefs !== "undefined") return $prefs.valueForKey(key);
      return null;
    }

    function write(val, key) {
      if (typeof $persistentStore !== "undefined") return $persistentStore.write(val, key);
      if (typeof $prefs !== "undefined") return $prefs.setValueForKey(val, key);
      return false;
    }

    function notify(title, subtitle, body) {
      if (typeof $notification !== "undefined" && typeof $notification.post === "function") {
        $notification.post(title, subtitle || "", body || "");
      } else if (typeof $notify !== "undefined") {
        $notify(title, subtitle || "", body || "");
      } else {
        // last resort
        console.log(`[notify] ${title} | ${subtitle} | ${body}`);
      }
    }

    function done(resp) {
      if (typeof $done === "function") $done(resp);
    }

    // HTTP unify:
    // returns Promise<{status, headers, body}>
    function httpGet(options) {
      return httpRequest({ ...options, method: "GET" });
    }
    function httpPost(options) {
      return httpRequest({ ...options, method: "POST" });
    }

    function httpRequest(options) {
      // Shadowrocket / QuantumultX: $task.fetch
      if (typeof $task !== "undefined" && typeof $task.fetch === "function") {
        const req = {
          url: options.url,
          method: options.method || "GET",
          headers: options.headers || {},
          body: options.body || "",
        };
        return $task.fetch(req).then((resp) => {
          return {
            status: resp.statusCode || resp.status || 0,
            headers: resp.headers || {},
            body: resp.body || "",
          };
        });
      }

      // Surge / Loon: $httpClient.get/post (没有 request 的环境很多)
      if (typeof $httpClient !== "undefined") {
        return new Promise((resolve, reject) => {
          const cb = (err, resp, data) => {
            if (err) return reject(err);
            resolve({
              status: resp && (resp.status || resp.statusCode) ? (resp.status || resp.statusCode) : 0,
              headers: (resp && resp.headers) || {},
              body: data || "",
            });
          };

          const req = {
            url: options.url,
            headers: options.headers || {},
            body: options.body || "",
          };

          const m = (options.method || "GET").toUpperCase();
          if (m === "POST") {
            if (typeof $httpClient.post === "function") return $httpClient.post(req, cb);
            // 兜底：少数环境有 request
            if (typeof $httpClient.request === "function") return $httpClient.request({ ...req, method: "POST" }, cb);
            return reject(new Error("No $httpClient.post/request available"));
          } else {
            if (typeof $httpClient.get === "function") return $httpClient.get(req, cb);
            if (typeof $httpClient.request === "function") return $httpClient.request({ ...req, method: "GET" }, cb);
            return reject(new Error("No $httpClient.get/request available"));
          }
        });
      }

      return Promise.reject(new Error("No HTTP method available in this environment."));
    }

    return { isSurge, isLoon, isQX, isSR, read, write, notify, done, httpGet, httpPost };
  })();

  // ========== UTILS ==========
  const NEED_KEYS = [
    "Connection",
    "Accept-Encoding",
    "Priority",
    "Content-Type",
    "Origin",
    "refract-sign",
    "User-Agent",
    "refract-key",
    "Sec-Fetch-Mode",
    "Cookie",
    "Host",
    "Referer",
    "Accept-Language",
    "Accept",
  ];

  function pickNeedHeaders(src = {}) {
    const dst = {};
    const get = (name) => src[name] ?? src[name.toLowerCase()] ?? src[name.toUpperCase()];
    for (const k of NEED_KEYS) {
      const v = get(k);
      if (v !== undefined) dst[k] = v;
    }
    return dst;
  }

  // 放宽匹配：readme=1 不一定在最后
  function extractUIDFromUrl(url) {
    const u = String(url || "");
    const m = u.match(/\/api\/account\/getInfo\/(\d+)\?[^#]*readme=1/i);
    return m ? m[1] : "";
  }

  function safeJsonParse(s) {
    try {
      return JSON.parse(s);
    } catch (_) {
      return null;
    }
  }

  function extractChickenLegs(objOrText) {
    const text =
      typeof objOrText === "string"
        ? objOrText
        : JSON.stringify(objOrText || {}) || "";

    const m = text.match(/(\d+)\s*鸡腿/);
    if (m) return Number(m[1]);

    const obj = typeof objOrText === "object" ? objOrText : safeJsonParse(text);
    if (!obj) return null;

    const candidates = [
      obj?.data?.chicken,
      obj?.data?.chickenLegs,
      obj?.data?.drumstick,
      obj?.data?.reward?.chicken,
      obj?.data?.reward?.chickenLegs,
      obj?.reward?.chicken,
      obj?.reward?.chickenLegs,
      obj?.gain,
      obj?.data?.gain,
    ];

    for (const v of candidates) {
      if (typeof v === "number" && Number.isFinite(v)) return v;
      if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
    }
    return null;
  }

  function buildHeaders(savedHeaders = {}) {
    return {
      Connection: savedHeaders["Connection"] || "keep-alive",
      "Accept-Encoding": savedHeaders["Accept-Encoding"] || "gzip, deflate, br",
      Priority: savedHeaders["Priority"] || "u=3, i",
      "Content-Type": savedHeaders["Content-Type"] || "text/plain;charset=UTF-8",
      Origin: savedHeaders["Origin"] || "https://www.nodeseek.com",
      "refract-sign": savedHeaders["refract-sign"] || "",
      "User-Agent":
        savedHeaders["User-Agent"] ||
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7.2 Mobile/15E148 Safari/604.1",
      "refract-key": savedHeaders["refract-key"] || "",
      "Sec-Fetch-Mode": savedHeaders["Sec-Fetch-Mode"] || "cors",
      Cookie: savedHeaders["Cookie"] || "",
      Host: savedHeaders["Host"] || "www.nodeseek.com",
      Referer: savedHeaders["Referer"] || "https://www.nodeseek.com/sw.js?v=0.3.33",
      "Accept-Language": savedHeaders["Accept-Language"] || "zh-CN,zh-Hans;q=0.9",
      Accept: savedHeaders["Accept"] || "*/*",
    };
  }

  function parseUserInfo(obj, fallbackUid) {
    const d = obj?.data ?? obj ?? {};
    const username = d?.username || d?.userName || d?.name || d?.nickname || "";
    const id = d?.id || d?.uid || fallbackUid || "";
    const level = d?.level || d?.lv || "";
    const chicken = extractChickenLegs(obj);
    const msg = obj?.message ? String(obj.message) : "";
    return { username, id, level, chicken, msg, raw: d };
  }

  function fetchUserInfo(headersObj, uid) {
    const url = `https://www.nodeseek.com/api/account/getInfo/${uid}?readme=1`;
    const headers = buildHeaders(headersObj);
    return Env.httpGet({ url, headers }).then((r) => {
      const obj = safeJsonParse(r.body || "");
      if (!obj) throw new Error(`getInfo 解析失败，status=${r.status}`);
      return obj;
    });
  }

  // ========== MODE 1: CAPTURE HEADERS ==========
  if (isGetHeader) {
    const allHeaders = ($request && $request.headers) || {};
    const picked = pickNeedHeaders(allHeaders);
    const uid = extractUIDFromUrl($request && $request.url);

    if (!picked || Object.keys(picked).length === 0) {
      Env.notify("NS Headers 获取失败", "", "未获取到指定请求头，请重新再试一次。");
      Env.done({});
      return;
    }

    const ok1 = Env.write(JSON.stringify(picked), NS_HEADER_KEY);
    if (uid) Env.write(String(uid), NS_UID_KEY);

    if (!ok1) {
      Env.notify("NS Headers 保存失败", "", "写入持久化存储失败，请检查配置。");
      Env.done({});
      return;
    }

    Env.notify("NS Headers 获取成功", "", uid ? `请求头已保存（UID: ${uid}）` : "请求头已保存（未解析到UID）");

    if (!uid) {
      Env.notify("NS 用户信息", "获取失败", "未能从 URL 中解析到 UID。");
      Env.done({});
      return;
    }

    // ✅ 等异步请求完成后再 done（避免 Surge rewrite 场景丢通知）
    fetchUserInfo(picked, uid)
      .then((obj) => {
        const info = parseUserInfo(obj, uid);
        const lines = [];
        if (info.username) lines.push(`用户：${info.username}`);
        if (info.id) lines.push(`ID：${info.id}`);
        if (info.level !== "") lines.push(`等级：${info.level}`);
        if (info.chicken !== null) lines.push(`鸡腿：${info.chicken}`);
        if (info.msg) lines.push(`提示：${info.msg}`);
        if (lines.length === 0) lines.push(`data：${JSON.stringify(info.raw).slice(0, 200)}`);
        Env.notify("NS 用户信息", "已获取", lines.join("\n"));
      })
      .catch((e) => {
        Env.notify("NS 用户信息", "请求错误", String(e));
      })
      .finally(() => {
        Env.done({});
      });

    return;
  }

// ========== MODE 2: CHECK-IN ==========
const raw = Env.read(NS_HEADER_KEY);
if (!raw) {
  Env.notify("NS签到结果", "无法签到", "本地没有已保存的请求头，请先抓包访问一次个人页面。");
  Env.done();
  return;
}

let savedHeaders = {};
try {
  savedHeaders = JSON.parse(raw) || {};
} catch (e) {
  Env.notify("NS签到结果", "无法签到", "本地保存的请求头数据损坏，请重新访问一次个人页面。");
  Env.done();
  return;
}

const uid = Env.read(NS_UID_KEY) || "";

// ✅ 先固定5(random=false)，失败再随机(random=true)
const SIGN_URL_FIXED = "https://www.nodeseek.com/api/attendance?random=false";
const SIGN_URL_RANDOM = "https://www.nodeseek.com/api/attendance?random=true";

function trySign(signUrl) {
  const req = {
    url: signUrl,
    headers: buildHeaders(savedHeaders),
    body: "",
  };

  return Env.httpPost(req).then((resp) => {
    const status = resp.status || 0;
    const body = resp.body || "";
    const obj = safeJsonParse(body);

    // 判定是否“成功可用”：
    // 1) 必须 2xx
    // 2) 返回体能解析为 JSON（否则认为失败回退）
    if (!(status >= 200 && status < 300)) {
      const err = new Error(`status=${status}`);
      err._status = status;
      err._body = body;
      err._obj = obj;
      throw err;
    }
    if (!obj) {
      const err = new Error(`invalid json, status=${status}`);
      err._status = status;
      err._body = body;
      throw err;
    }

    return { status, body, obj, signUrl };
  });
}

function buildFailNotify(title, status, msg, body) {
  // 保留你原来那套提示逻辑
  if (status === 403) {
    return { title, subtitle: "403 风控", content: `暂时被风控，稍后再试${msg ? `\n内容：${msg}` : ""}` };
  }
  if (status === 500) {
    return { title, subtitle: "500 服务器错误", content: msg || body || "服务器错误(500)，无返回内容" };
  }
  return { title, subtitle: `请求异常 ${status}`, content: msg || body || `请求失败，status=${status}` };
}

trySign(SIGN_URL_FIXED)
  .catch((e1) => {
    // 固定模式失败 -> 回退随机模式
    return trySign(SIGN_URL_RANDOM).catch((e2) => {
      // 两次都失败：优先用第二次错误（更接近最终结果），但也把第一次失败信息拼上
      const status2 = e2?._status || 0;
      const body2 = e2?._body || "";
      const obj2 = e2?._obj || safeJsonParse(body2) || {};
      const msg2 = obj2?.message ? String(obj2.message) : "";

      const status1 = e1?._status || 0;
      const body1 = e1?._body || "";
      const obj1 = e1?._obj || safeJsonParse(body1) || {};
      const msg1 = obj1?.message ? String(obj1.message) : "";

      const n2 = buildFailNotify("NS签到结果", status2, msg2, body2);
      const extra = `\n\n固定5尝试失败：${status1}${msg1 ? `（${msg1}）` : ""}`;
      Env.notify(n2.title, n2.subtitle, n2.content + extra);
      return null; // stop
    });
  })
  .then((result) => {
    if (!result) return;

    const { status, body, obj, signUrl } = result;
    const signMsg = obj?.message ? String(obj.message) : "";
    const gain = extractChickenLegs(obj) ?? extractChickenLegs(body);

    const modeText = signUrl.includes("random=false") ? "固定5" : "随机";
    const gainText = gain !== null ? `获得：${gain} 鸡腿` : "获得：未识别到鸡腿数量";

    if (!uid) {
      const content =
        `${gainText}\n模式：${modeText}` +
        (signMsg ? `\n签到提示：${signMsg}` : "") +
        `\n\n（未保存UID，无法查询余额：请进入个人信息页一次）`;
      Env.notify("NS签到结果", "已签到", content);
      return;
    }

    // 成功：查询余额并合并通知（只弹一次）
    return fetchUserInfo(savedHeaders, uid)
      .then((infoObj) => {
        const info = parseUserInfo(infoObj, uid);
        const balanceText = info.chicken !== null ? `当前鸡腿：${info.chicken}` : "当前鸡腿：未识别到余额";

        const head = [];
        if (info.username) head.push(`用户：${info.username}`);
        if (info.id) head.push(`ID：${info.id}`);

        const lines = [];
        if (head.length) lines.push(head.join("  "));
        lines.push(gainText);
        lines.push(balanceText);
        lines.push(`模式：${modeText}`);
        if (signMsg) lines.push(`签到提示：${signMsg}`);

        Env.notify("NS签到结果", "已签到", lines.join("\n"));
      })
      .catch((e) => {
        const content =
          `${gainText}\n模式：${modeText}` +
          (signMsg ? `\n签到提示：${signMsg}` : "") +
          `\n\n余额查询失败：${String(e)}`;
        Env.notify("NS签到结果", "已签到", content);
      });
  })
  .catch((e) => {
    Env.notify("NS签到结果", "请求错误", String(e));
  })
  .finally(() => {
    Env.done();
  });
}

main();
