const API_URL = "https://ioa.onskrgames.uk/getLines";

const headers = {
    "User-Agent": "Shadowrocket/2.2.25 (iPhone; iOS 17.0)",
    "Accept": "*/*",
    "Content-Type": "application/json",
    "platform": "ios",
    "versionnum": "1.0.0",
    "bundleid": "com.onskr.vpn"
};

// RC4
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

// 生成 key/iv
function generateKeyIV() {
    const seed1 = "onskr_key_seed";
    const seed2 = "onskr_iv_seed";

    const mix = headers["User-Agent"] + headers["platform"];

    return {
        key: rc4(seed1, mix).slice(0, 16),
        iv:  rc4(seed2, mix).slice(0, 16)
    };
}

// 请求
function request(cb) {
    $task.fetch({ url: API_URL, headers }).then(
        res => cb(null, res.body),
        err => cb(err)
    );
}

// 解密
function decrypt(hexStr) {
    const { key, iv } = generateKeyIV();

    console.log("🔑 key:", key);
    console.log("🔑 iv :", iv);

    const encrypted = CryptoJS.enc.Hex.parse(hexStr);

    const decrypted = CryptoJS.AES.decrypt(
        { ciphertext: encrypted },
        CryptoJS.enc.Utf8.parse(key),
        {
            iv: CryptoJS.enc.Utf8.parse(iv),
            mode: CryptoJS.mode.CBC,
            padding: CryptoJS.pad.Pkcs7
        }
    );

    return decrypted.toString(CryptoJS.enc.Utf8);
}

// 主流程
request((err, body) => {
    if (err) return $done();

    try {
        const text = decrypt(body);
        console.log("✅ 解密:", text.slice(0,80));

        const json = JSON.parse(text);

        const proxies = json.data.map(n =>
            `${n.title} = ss, ${n.ip}, ${n.port}, encrypt-method=${n.encrypt}, password=${n.password}`
        );

        $done({ body: proxies.join("\n") });

    } catch (e) {
        console.log("❌ 解密失败:", e);
        $done();
    }
});
