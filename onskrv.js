const API_URL = "https://ioa.onskrgames.uk/getLines";

const headers = {
    "user-agent": "Surge iOS",
    "accept": "*/*"
};

function httpRequest(callback) {
    if (typeof $task !== "undefined") {
        $task.fetch({
            url: API_URL,
            headers: headers
        }).then(
            res => callback(null, res.body),
            err => callback(err)
        );
    } else {
        $httpClient.get({ url: API_URL, headers }, (err, resp, data) => {
            callback(err, data);
        });
    }
}

// ✅ 正确解密（HEX + 正确 key/iv）
function decryptData(hexStr) {
    try {
        const key = CryptoJS.enc.Utf8.parse("e3f1c9a8b7d6e5f4");
        const iv  = CryptoJS.enc.Utf8.parse("a1b2c3d4e5f60718");

        const encryptedHex = CryptoJS.enc.Hex.parse(hexStr);

        const decrypted = CryptoJS.AES.decrypt(
            { ciphertext: encryptedHex },
            key,
            {
                iv: iv,
                mode: CryptoJS.mode.CBC,
                padding: CryptoJS.pad.Pkcs7
            }
        );

        const text = decrypted.toString(CryptoJS.enc.Utf8);

        console.log("🔓 解密成功:", text.slice(0,80));

        const json = JSON.parse(text);
        return json.data;

    } catch (e) {
        console.log("❌ 解密失败:", e);
        return [];
    }
}

function formatProxies(list) {
    return list.map(n =>
        `${n.title} = ss, ${n.ip}, ${n.port}, encrypt-method=${n.encrypt}, password=${n.password}`
    );
}

httpRequest((err, body) => {
    if (err || !body) {
        console.log("❌ 请求失败");
        $done();
        return;
    }

    const nodes = decryptData(body);
    const proxies = formatProxies(nodes);

    console.log("✅ 节点数量:", proxies.length);

    $done({
        body: proxies.join("\n")
    });
});
