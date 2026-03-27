// ==UserScript==
// @name         ONSKR FULL FIX SAFE
// ==/UserScript==

const API_URL = "https://ioa.onskrgames.uk/getLines";

// ====== request 阶段 ======
if (typeof $request !== "undefined") {

    console.log("🚀 重定向请求");

    $done({
        url: API_URL
    });

} else if (typeof $response !== "undefined") {

    // ====== response 阶段 ======
    let body = $response.body;

    try {

        console.log("📦 收到数据长度:", body.length);

        let encrypted = CryptoJS.enc.Hex.parse(body);

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

        console.log("🔥 明文:", text.slice(0,100));

        let json = JSON.parse(text);

        let proxies = json.data.map(n =>
            `${n.title} = ss, ${n.ip}, ${n.port}, encrypt-method=${n.encrypt}, password=${n.password}`
        );

        console.log("✅ 节点数量:", proxies.length);

        $done({
            body: proxies.join("\n")
        });

    } catch (e) {

        console.log("❌ 解密失败:", e);
        console.log("📦 原始数据:", body.slice(0,100));

        $done({
            body: body
        });
    }
}
