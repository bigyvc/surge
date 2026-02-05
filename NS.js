// 2026.1.17 QX -> Surge（合并通知版，修复 Surge 顶层 return 报错）
// - 抓 getInfo 请求头保存后：主动请求 getInfo 并弹出用户信息
// - 签到成功后：只弹 1 条通知（获得X鸡腿 + 当前余额Y + 可选用户名/ID）

function main() {
  const NS_HEADER_KEY = "NS_NodeseekHeaders";
  const NS_UID_KEY = "NS_NodeseekUID";
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

  const $store = {
    set: (k, v) => $persistentStore.write(v, k),
    get: (k) => $persistentStore.read(k),
  };

  function notify(title, subtitle, body) {
    $notification.post(title, subtitle || "", body || "");
  }

  function safeJsonParse(s) {
    try {
      return JSON.parse(s);
    } catch (_) {
      return null;
    }
  }

  function extractUIDFromUrl(url) {
    const m = String(url || "").match(/\/api\/account\/getInfo\/(\d+)\?readme=1$/);
    return m ? m[1] : "";
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

  function fetchUserInfo(headersObj, uid, cb) {
    if (!uid) return cb(new Error("missing uid"));
    const url = `https://www.nodeseek.com/api/account/getInfo/${uid}?readme=1`;
    const headers = buildHeaders(headersObj);

    $httpClient.get({ url, headers }, (err, resp, data) => {
      if (err) return cb(err);
      const status = resp?.status || 0;
      const obj = safeJsonParse(data || "");
      if (!obj) return cb(new Error(`parse failed, status=${status}`));
      cb(null, obj);
    });
  }

  /* ===================== 抓头并弹用户信息 ===================== */
  /* ===================== 抓头并弹用户信息（修复：done 太早导致不弹用户信息） ===================== */
  if (isGetHeader) {
    const allHeaders = $request.headers || {};
    const picked = pickNeedHeaders(allHeaders);
    const uid = extractUIDFromUrl($request.url);

    if (!picked || Object.keys(picked).length === 0) {
      notify("NS Headers 获取失败", "", "未获取到指定请求头，请重新再试一次。");
      $done({});
      return;
    }

    const ok1 = $store.set(NS_HEADER_KEY, JSON.stringify(picked));
    if (uid) $store.set(NS_UID_KEY, String(uid));

    if (!ok1) {
      notify("NS Headers 保存失败", "", "写入持久化存储失败，请检查配置。");
      $done({});
      return;
    }

    // 先提示保存成功
    notify(
      "NS Headers 获取成功",
      "",
      uid ? `请求头已保存（UID: ${uid}）` : "请求头已保存（未解析到UID）"
    );

    if (!uid) {
      notify("NS 用户信息", "获取失败", "未能从 URL 中解析到 UID。");
      $done({});
      return;
    }

    // ✅ 关键：等用户信息请求完成后再 done
    fetchUserInfo(picked, uid, (err, obj) => {
      if (err) {
        notify("NS 用户信息", "请求错误", String(err));
        $done({});
        return;
      }

      const info = parseUserInfo(obj, uid);
      const lines = [];
      if (info.username) lines.push(`用户：${info.username}`);
      if (info.id) lines.push(`ID：${info.id}`);
      if (info.level !== "") lines.push(`等级：${info.level}`);
      if (info.chicken !== null) lines.push(`鸡腿：${info.chicken}`);
      if (info.msg) lines.push(`提示：${info.msg}`);
      if (lines.length === 0) lines.push(`data：${JSON.stringify(info.raw).slice(0, 200)}`);

      notify("NS 用户信息", "已获取", lines.join("\n"));
      $done({});
    });

    return;
  }

  /* ===================== 定时签到：成功只弹 1 条通知 ===================== */
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
    notify("NS签到结果", "无法签到", "本地保存的请求头数据损坏，请重新访问一次个人页面。");
    $done();
    return;
  }

  const uid = $store.get(NS_UID_KEY) || "";

  const signUrl = "https://www.nodeseek.com/api/attendance?random=true";
  const signReq = {
    url: signUrl,
    method: "POST",
    headers: buildHeaders(savedHeaders),
    body: "",
  };

  $httpClient.request(signReq, (error, response, data) => {
    if (error) {
      notify("NS签到结果", "请求错误", String(error));
      $done();
      return;
    }

    const status = response?.status || 0;
    const respBody = data || "";
    const signObj = safeJsonParse(respBody);
    const signMsg = signObj?.message ? String(signObj.message) : "";
    const gain = signObj ? extractChickenLegs(signObj) : extractChickenLegs(respBody);

    if (!(status >= 200 && status < 300)) {
      if (status === 403) {
        notify("NS签到结果", "403 风控", `暂时被风控，稍后再试${signMsg ? `\n内容：${signMsg}` : ""}`);
      } else if (status === 500) {
        notify("NS签到结果", "500 服务器错误", signMsg || respBody || "服务器错误(500)，无返回内容");
      } else {
        notify("NS签到结果", `请求异常 ${status}`, signMsg || respBody || `请求失败，status=${status}`);
      }
      $done();
      return;
    }

    const gainText = gain !== null ? `获得：${gain} 鸡腿` : "获得：未识别到鸡腿数量";

    if (!uid) {
      const body = `${gainText}${signMsg ? `\n${signMsg}` : ""}\n\n（未保存UID，无法查询余额：请进入个人信息页一次）`;
      notify("NS签到结果", "已签到", body);
      $done();
      return;
    }

    fetchUserInfo(savedHeaders, uid, (err, infoObj) => {
      if (err) {
        const body = `${gainText}${signMsg ? `\n${signMsg}` : ""}\n\n余额查询失败：${String(err)}`;
        notify("NS签到结果", "已签到", body);
        $done();
        return;
      }

      const info = parseUserInfo(infoObj, uid);
      const balanceText = info.chicken !== null ? `当前鸡腿：${info.chicken}` : "当前鸡腿：未识别到余额";

      const head = [];
      if (info.username) head.push(`用户：${info.username}`);
      if (info.id) head.push(`ID：${info.id}`);

      const bodyLines = [];
      if (head.length) bodyLines.push(head.join("  "));
      bodyLines.push(gainText);
      bodyLines.push(balanceText);
      if (signMsg) bodyLines.push(`签到提示：${signMsg}`);

      notify("NS签到结果", "已签到", bodyLines.join("\n"));
      $done();
    });
  });
}

main();
