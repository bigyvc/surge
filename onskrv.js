// ==UserScript==
// @name         ONSKR Clean Version
// @version      1.0
// ==/UserScript==

const API_URL = "https://ioa.onskrgames.uk/getLines";

// 请求函数（兼容 Surge / Loon / QuanX）
function httpRequest(url, callback) {
    const options = { url: url };

    if (typeof $task !== "undefined") {
        $task.fetch(options).then(
            res => callback(null, res.body),
            err => callback(err)
        );
    } else {
        $httpClient.get(options, (err, resp, data) => {
            callback(err, data);
        });
    }
}

// 解密函数（核心）
function decryptData(encrypted) {
    try {
        const key = CryptoJS.enc.Utf8.parse("0123456789abcdef"); // ⚠️ 如失败需替换
        const iv  = CryptoJS.enc.Utf8.parse("abcdef0123456789"); // ⚠️ 如失败需替换

        const decrypted = CryptoJS.AES.decrypt(
            { ciphertext: CryptoJS.enc.Base64.parse(encrypted) },
            key,
            {
                iv: iv,
                mode: CryptoJS.mode.CBC,
                padding: CryptoJS.pad.Pkcs7
            }
        );

        const text = decrypted.toString(CryptoJS.enc.Utf8);
        const json = JSON.parse(text);

        return json.data.map(item => ({
            title: item.title,
            ip: item.ip,
            port: item.port,
            password: item.password,
            encrypt: item.encrypt
        }));

    } catch (e) {
        console.log("❌ 解密失败:", e);
        return [];
    }
}

// 节点格式化
function formatProxies(list) {
    const nameCount = {};
    const result = [];

    list.forEach(node => {
        let { title, ip, port, password, encrypt } = node;

        if (!nameCount[title]) nameCount[title] = 0;
        nameCount[title]++;

        const name = nameCount[title] > 1
            ? `${title}-${nameCount[title]}`
            : title;

        const method = encrypt ? encrypt.toLowerCase() : "aes-256-gcm";

        result.push(
            `${name} = ss, ${ip}, ${port}, encrypt-method=${method}, password=${password}`
        );
    });

    return result;
}

// 主流程
httpRequest(API_URL, (err, body) => {
    if (err) {
        console.log("❌ 请求失败:", err);
        $done();
        return;
    }

    const nodes = decryptData(body);
    const proxies = formatProxies(nodes);

    console.log(`✅ 获取节点数量: ${proxies.length}`);

    $done({
        body: proxies.join("\n")
    });
});
