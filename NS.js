// NS签到 Surge
// 功能：抓 getInfo 的请求头保存；定时重放 attendance 签到

const NS_HEADER_KEY = "NS_NodeseekHeaders";
const isGetHeader = typeof $request !== "undefined";

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

// Surge KV 兼容封装
const $store = {
  set: (k, v) => $persistentStore.write(v, k),
  get: (k) => $persistentStore.read(k),
};

function notify(title, subtitle, body) {
  $notification.post(title, subtitle || "", body || "");
}

if (isGetHeader) {
  const allHeaders = $request.headers || {};
  const picked = pickNeedHeaders(allHeaders);

  if (!picked || Object.keys(picked).length === 0) {
    console.log("[NS] picked headers empty:", JSON.stringify(allHeaders));
    notify("NS Headers 获取失败", "", "未获取到指定请求头，请重新再试一次。");
    $done({});
  } else {
    const ok = $store.set(NS_HEADER_KEY, JSON.stringify(picked));
    console.log("[NS] saved picked headers:", JSON.stringify(picked));
    if (ok) {
      notify("NS Headers 获取成功", "", "指定请求头已持久化保存。");
    } else {
      notify("NS Headers 保存失败", "", "写入持久化存储失败，请检查配置。");
    }
    $done({});
  }
} else {
  const raw = $store.get(NS_HEADER_KEY);
  if (!raw) {
    notify("NS签到结果", "无法签到", "本地没有已保存的请求头，请先抓包访问一次个人页面。");
    $done();
    return;
  }

  let savedHeaders = {};
  try {
    savedHeaders = JSON.parse(raw) || {};
  } catch (e) {
    console.log("[NS] parse saved headers failed:", e);
    notify("NS签到结果", "无法签到", "本地保存的请求头数据损坏，请重新访问一次个人页面。");
    $done();
    return;
  }

  const url = "https://www.nodeseek.com/api/attendance?random=true";
  const method = "POST";

  const headers = {
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

  const body = "";

  const req = { url, method, headers, body };

  $httpClient.request(req, (error, response, data) => {
    if (error) {
      const err = String(error);
      console.log("[NS签到] request error:", err);
      notify("NS签到结果", "请求错误", err);
      $done();
      return;
    }

    const status = response?.status || 0;
    const respBody = data || "";

    let msg = "";
    try {
      const obj = JSON.parse(respBody);
      msg = obj?.message ? String(obj.message) : "";
      console.log(`[NS签到] parsed message: ${msg || "(empty)"}`);
    } catch (e) {
      console.log("[NS签到] JSON parse failed:", e);
    }

    if (status === 403) {
      const content = `暂时被风控，稍后再试\n${msg ? `内容：${msg}` : `响应体：${respBody}`}`;
      notify("NS签到结果", "403 风控", content);
    } else if (status === 500) {
      const content = msg || respBody || "服务器错误(500)，无返回内容";
      notify("NS签到结果", "500 服务器错误", content);
    } else if (status >= 200 && status < 300) {
      const content = msg || "NS签到成功，但未返回 message";
      notify("NS签到结果", "签到成功", content);
    } else {
      const content = msg || respBody || `请求失败，status=${status}`;
      notify("NS签到结果", `请求异常 ${status}`, content);
    }

    $done();
  });
}
