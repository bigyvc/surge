// ==UserScript==
// @name         ONSKR FINAL FIX SAFE
// ==/UserScript==

(function () {

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

            // 打印返回的原始数据前100个字符
            console.log("📦 返回的原始数据:", body.slice(0, 100));

            // 确保返回数据是 JSON 格式
            let json = JSON.parse(body);

            // 打印解析后的数据
            console.log("🔥 解析后的数据:", json);

            let proxies = json.data.map(n =>
                `${n.title} = ss, ${n.ip}, ${n.port}, encrypt-method=${n.encrypt || 'aes-256-cfb'}, password=${n.password || 'default_password'}`
            );

            console.log("✅ 节点数量:", proxies.length);

            $done({
                body: proxies.join("\n")
            });

        } catch (e) {

            // 解析失败，打印错误信息和返回的原始数据
            console.log("❌ 解析失败:", e);
            console.log("📦 原始数据:", body.slice(0, 100));

            $done({
                body: body  // 直接返回原始数据以便调试
            });
        }
    }

})();
