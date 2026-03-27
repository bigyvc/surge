// ==UserScript==
// @name         ONSKR Decrypt Output
// ==/UserScript==

(function () {

    // 👉 保留原混淆函数（不用动）
    function rc4(key, data) {
        let s = [], j = 0, x, res = '';
        for (let i = 0; i < 256; i++) s[i] = i;

        for (let i = 0; i < 256; i++) {
            j = (j + s[i] + key.charCodeAt(i % key.length)) % 256;
            [s[i], s[j]] = [s[j], s[i]];
        }

        let i = 0; j = 0;
        for (let y = 0; y < data.length; y++) {
            i = (i + 1) % 256;
            j = (j + s[i]) % 256;
            [s[i], s[j]] = [s[j], s[i]];
            x = s[(s[i] + s[j]) % 256];
            res += String.fromCharCode(data.charCodeAt(y) ^ x);
        }
        return res;
    }

    // 👉 原请求返回
    let body = $response.body;

    try {
        // 👉 原脚本解密逻辑（保持）
        let encrypted = CryptoJS.enc.Hex.parse(body);

        // ⚠️ 这里用原脚本的 key/iv 获取逻辑（你原文件已有）
        let key = CryptoJS.enc.Utf8.parse("0123456789abcdef");
        let iv  = CryptoJS.enc.Utf8.parse("abcdef0123456789");

        let decrypted = CryptoJS.AES.decrypt(
            { ciphertext: encrypted },
            key,
            {
                iv: iv,
                mode: CryptoJS.mode.CBC,
                padding: CryptoJS.pad.Pkcs7
            }
        );

        let text = decrypted.toString(CryptoJS.enc.Utf8);

        // 🔥 👉 关键：打印明文
        console.log("🔥 明文数据:", text);

        let json = JSON.parse(text);

        // 👉 转 Surge 节点
        let proxies = json.data.map(n =>
            `${n.title} = ss, ${n.ip}, ${n.port}, encrypt-method=${n.encrypt}, password=${n.password}`
        );

        console.log("✅ 节点数量:", proxies.length);

        // 🔥 👉 直接输出订阅（替代原逻辑）
        $done({
            body: proxies.join("\n")
        });

        return;

    } catch (e) {
        console.log("❌ 解密失败:", e);

        // 👉 fallback：输出原始数据方便调试
        $done({
            body: body
        });
    }

})();
