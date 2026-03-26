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

httpRequest((err, body) => {
    if (err || !body) {
        console.log("❌ 请求失败");
        $done();
        return;
    }

    console.log("✅ 原始返回:", body.slice(0,100));

    $done({ body: body }); // 👉 先看看返回啥
});
