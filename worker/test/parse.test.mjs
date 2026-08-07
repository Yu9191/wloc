// 纯函数级回归测试, 不联网。运行: npm test  (等价于 node --test test/)
//
// 这里锁住的每一条几乎都对应一个真实踩过的坑 —— 解析类代码的失败模式不是抛错,
// 而是「静默返回一个看起来很正常的错误坐标」, 只有把已知正确的行为钉死, 下一次
// 改正则时才有东西拦得住。
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extractFromString,
  extractBaiduFromBody,
  bd09mcToBd09,
  toWgs84,
  wgs84ToGcj02,
  gcj02ToWgs84,
  usesWgs84Locally,
  inRange,
  round6,
} from "../src/parse.js";
import { GCJ_BROWSER_JS } from "../src/gcj-browser.js";

// 两点间距离(米), 用于把「差了多少」说成人能判断的单位而不是小数位数。
function distMeters(a, b) {
  const R = 6371000;
  const rad = (d) => (d * Math.PI) / 180;
  const c = Math.sin(rad(a.lat)) * Math.sin(rad(b.lat)) +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(a.lon - b.lon));
  return Math.acos(Math.min(1, Math.max(-1, c))) * R;
}

const near = (got, want, tolDeg = 1e-6) => {
  assert.ok(got, "期望解析成功, 实际返回 null");
  assert.ok(Math.abs(got.lat - want.lat) < tolDeg, `lat ${got.lat} != ${want.lat}`);
  assert.ok(Math.abs(got.lon - want.lon) < tolDeg, `lon ${got.lon} != ${want.lon}`);
  if (want.src !== undefined) assert.equal(got.src, want.src);
};

test("Google: 取地点针脚 !3d!4d, 不取相机视口 @", () => {
  // @ 后面那组是视口中心, 与缩放级别绑定, 实测能离目标 13 公里。
  const u =
    "https://www.google.com/maps/place/Apple+Park/@37.4391234,-122.0515788,11.21z/data=" +
    "!4m6!3m5!1s0x808fb596e9e188fd:0x3b0d8391510688f0!8m2!3d37.3346438!4d-122.008972!16s%2Fg%2F11bzx2n6td";
  near(extractFromString(u), { lat: 37.3346438, lon: -122.008972, src: "google" });
  assert.equal(extractFromString(u).name, "Apple Park");
});

test("Google: 没有针脚时才退回视口 @", () => {
  near(extractFromString("https://www.google.com/maps/@37.4391234,-122.0515788,11z"), {
    lat: 37.4391234,
    lon: -122.0515788,
    src: "google",
  });
});

test("正文扫描必须关掉裸坐标兜底", () => {
  // 百度页面里的 "view_dir":"-0.8477,0.0000,-0.53" 会被裸坐标规则命中,
  // 结果是把一个视角向量当成经纬度返回。
  const body = '{"a":1,"view_dir":"-0.8477,0.0000,-0.53"}';
  assert.equal(extractFromString(body, { allowBare: false }), null);
  near(extractFromString(body), { lat: -0.8477, lon: 0, src: "text" }); // 允许兜底时确实会命中
});

test("ll= 必须有词边界, 否则 scroll=/pull= 都会被当成坐标", () => {
  assert.equal(extractFromString("scroll=1.5,2.5", { allowBare: false }), null);
  near(extractFromString("https://x/?ll=39.908823,116.397470"), {
    lat: 39.908823,
    lon: 116.39747,
    src: "apple",
  });
});

test("百度 BD09MC -> BD09 -> WGS84 全链路 (基准: 深圳万象天地)", () => {
  const hit = extractBaiduFromBody('"x":"12686385.66","y":"2560876.53"');
  assert.equal(hit.src, "baidu");
  const w = toWgs84(hit.lat, hit.lon, "baidu");
  const truth = { lat: 22.544865, lon: 113.951072 }; // 实测 GPS 基准
  assert.ok(distMeters(w, truth) < 30, `偏差 ${distMeters(w, truth).toFixed(1)} 米, 应 < 30`);
});

test("百度: 标准 Web 墨卡托逆算是错的, 必须走分段多项式", () => {
  // 用标准墨卡托反算同一组 x/y, 看看差多少 —— 差到公里级就说明系数表不能省。
  const x = 12686385.66, y = 2560876.53;
  const webMercator = {
    lon: (x / 20037508.34) * 180,
    lat: (Math.atan(Math.exp(((y / 20037508.34) * 180 * Math.PI) / 180)) * 360) / Math.PI - 90,
  };
  const correct = bd09mcToBd09(x, y);
  assert.ok(distMeters(webMercator, correct) > 5000, "两种算法应当差出公里级");
});

test("百度: 像素级 x/y 不得被当成墨卡托米制", () => {
  assert.equal(extractBaiduFromBody('"x":"320","y":"480"'), null);
});

test("百度网页版 URL 里的 BD09MC: /poi/名称/@x,y,19z", () => {
  // 港澳台的百度分享短链在服务端拿不到坐标(需页面脚本带反爬令牌查 detailConInfo),
  // 但用户在浏览器打开后地址栏会变成这个形式, 复制过来就能解析 —— 这是那条唯一
  // 走得通的路, 必须守住。下列 x/y 均为浏览器实测所得。
  const 用例 = [
    ["香港 ifc", "12709535.375,2529761.45", { lat: 22.284774, lon: 114.159437 }, 100],
    ["台北 101", "13533702.855,2862107.79", { lat: 25.033626, lon: 121.564215 }, 100],
    ["澳门 Galaxy", "12642194.145,2513614.06", { lat: 22.148148, lon: 113.555399 }, 300],
  ];
  for (const [名, xy, truth, tol] of 用例) {
    const u = `https://map.baidu.com/poi/Apple/@${xy},19z?uid=abc`;
    const hit = extractFromString(u);
    assert.ok(hit, `${名} 未解析出坐标`);
    assert.equal(hit.src, "baidu");
    const w = toWgs84(hit.lat, hit.lon, hit.src);
    const d = distMeters(w, truth);
    assert.ok(d < tol, `${名} 偏差 ${d.toFixed(0)} 米, 应 < ${tol}`);
  }
  // 地名从路径里取
  assert.equal(
    extractFromString("https://map.baidu.com/poi/Apple%E5%8F%B0%E5%8C%97101/@13533702.855,2862107.79,19z").name,
    "Apple台北101"
  );
});

test("百度的米制 @ 规则不得吃掉 Google 的经纬度 @", () => {
  // 两者都是 @a,b 形式, 靠位数区分: 墨卡托是 6~9 位整数, 经纬度是 1~3 位。
  near(extractFromString("https://www.google.com/maps/@37.4391234,-122.0515788,11z"), {
    lat: 37.4391234,
    lon: -122.0515788,
    src: "google",
  });
  // 非百度域名的大数字 @ 不该被当成 BD09MC
  assert.equal(extractFromString("https://example.com/x/@12709535.375,2529761.45,19z"), null);
});

test("回归: 苹果 / 高德 / 裸文本的原有行为不变", () => {
  near(
    extractFromString("https://maps.apple.com/place?coordinate=31.230416,121.473701&name=%E5%A4%96%E6%BB%A9"),
    { lat: 31.230416, lon: 121.473701, src: "apple" }
  );
  assert.equal(
    extractFromString("https://maps.apple.com/place?coordinate=31.230416,121.473701&name=%E5%A4%96%E6%BB%A9").name,
    "外滩"
  );
  near(extractFromString("https://amap.com/?q=39.908823,116.397470,天安门"), {
    lat: 39.908823,
    lon: 116.39747,
    src: "amap",
  });
  near(extractFromString("39.908823,116.397470"), { lat: 39.908823, lon: 116.39747, src: "text" });
});

test("高德 URI: lnglat= / position= 是「经度,纬度」序", () => {
  // 这两个键与上面所有规则的顺序相反。曾经由页面本地规则处理, 改成统一走服务端
  // 之后服务端不认, 掉进裸坐标兜底 -> 经纬颠倒 -> 返回 lat=113.9 这种越界值。
  near(extractFromString("https://ditu.amap.com/?lnglat=113.9494,22.5448"), {
    lat: 22.5448,
    lon: 113.9494,
    src: "amap",
  });
  near(extractFromString("https://uri.amap.com/marker?position=116.473195,39.993253&name=%E4%B8%AD%E5%85%B3%E6%9D%91"), {
    lat: 39.993253,
    lon: 116.473195,
    src: "amap",
  });
  assert.equal(
    extractFromString("https://uri.amap.com/marker?position=116.473195,39.993253&name=%E4%B8%AD%E5%85%B3%E6%9D%91").name,
    "中关村"
  );
});

test("越界坐标一律不返回", () => {
  // 兜底规则不带语义, 匹配到什么就是什么。值域校验是最后一道闸, 它不需要理解
  // 任何一种链接格式, 就能把「解析失败」和「解析成错的」区分开。
  assert.equal(extractFromString("?q=999.1234,888.5678"), null);
  assert.equal(extractFromString("coordinate=91.12345,181.98765"), null);
  assert.equal(extractFromString("?ll=1234.5678,12.3456"), null);
  assert.ok(inRange(22.5, 113.9));
  assert.ok(!inRange(91, 0));
  assert.ok(!inRange(0, 181));
  assert.ok(!inRange(NaN, 0));
});

test("toWgs84: 按来源分派, text 源不做任何换算", () => {
  const p = { lat: 22.547674, lon: 113.962501 };
  for (const src of ["apple", "amap", "google"]) {
    const w = toWgs84(p.lat, p.lon, src);
    assert.ok(distMeters(w, p) > 300, `${src} 在境内应当有 GCJ 偏移`);
  }
  assert.deepEqual(toWgs84(p.lat, p.lon, "text"), p);
  assert.deepEqual(toWgs84(p.lat, p.lon, undefined), p);
});

// ── 港澳台 ──────────────────────────────────────────────────────────
// 每个基准点都是分享链接里的原始值, 与设备 GPS 逐位相同, 即真值本身。
const HK = { lat: 22.284774, lon: 114.159437 }; // ifc mall
const MO = { lat: 22.148148, lon: 113.555399 }; // Galaxy Macau
const TW = { lat: 25.033626, lon: 121.564215 }; // Taipei 101

test("港澳台: 苹果/Google 发的是 WGS84, 不得再做 GCJ 反算", () => {
  for (const [名, p] of [["香港", HK], ["澳门", MO], ["台湾", TW]]) {
    for (const src of ["apple", "google"]) {
      const w = toWgs84(p.lat, p.lon, src);
      assert.ok(
        distMeters(w, p) < 0.001,
        `${名} ${src} 被改动了 ${distMeters(w, p).toFixed(0)} 米, 应原样返回`
      );
    }
  }
});

test("港澳台: 高德/百度仍是偏移坐标, 必须继续换算", () => {
  // 实测依据: 把卫星图与高德瓦片放在同一坐标上比对, 香港的高德图差 596 米,
  // 与大陆同量级 —— 高德在港澳台并没有改用 WGS84。
  for (const [名, p] of [["香港", HK], ["澳门", MO], ["台湾", TW]]) {
    const w = toWgs84(p.lat, p.lon, "amap");
    assert.ok(
      distMeters(w, p) > 300,
      `${名} 高德只改动了 ${distMeters(w, p).toFixed(0)} 米, 应当有 GCJ 量级的偏移`
    );
    assert.ok(!usesWgs84Locally(p.lat, p.lon, "amap"), `${名} amap 不该走 WGS84 直通`);
    assert.ok(!usesWgs84Locally(p.lat, p.lon, "baidu"), `${名} baidu 不该走 WGS84 直通`);
  }
});

test("香港边界: 深圳一侧必须仍按大陆处理", () => {
  // 香港北界紧贴深圳, 用矩形圈会把这些点一起吞掉 —— 那才是最常用的坐标区域。
  const 深圳 = [
    ["万象天地", 22.544865, 113.951072],
    ["蛇口海上世界", 22.4795, 113.9245],
    ["福田口岸", 22.5310, 114.0730],
    ["罗湖", 22.5480, 114.1180],
    ["盐田", 22.5570, 114.2350],
  ];
  for (const [名, lat, lon] of 深圳) {
    assert.ok(!usesWgs84Locally(lat, lon, "apple"), `${名} 被误判成香港`);
    assert.ok(distMeters(toWgs84(lat, lon, "apple"), { lat, lon }) > 300, `${名} 应当做 GCJ 换算`);
  }
});

test("香港边界: 香港一侧必须按 WGS84 处理", () => {
  const 香港 = [
    ["中环 ifc", 22.284774, 114.159437],
    ["元朗", 22.4450, 114.0300],
    ["天水围", 22.4580, 114.0050],
    ["上水", 22.5010, 114.1280],
    ["赤鱲角机场", 22.3080, 113.9180],
    ["西贡", 22.3830, 114.2710],
  ];
  for (const [名, lat, lon] of 香港) {
    assert.ok(usesWgs84Locally(lat, lon, "apple"), `${名} 未被识别为香港`);
  }
});

test("港澳台判定不得波及大陆其它城市", () => {
  const 大陆 = [
    ["北京", 39.908823, 116.39747],
    ["上海", 31.230416, 121.473701],
    ["广州", 23.129163, 113.264435],
    ["厦门", 24.4798, 118.0894], // 紧邻金门, 台湾框不得吞掉
    ["福州", 26.0745, 119.2965],
    ["珠海拱北", 22.2230, 113.5480], // 紧邻澳门关闸
    ["温州", 27.9940, 120.6990],
  ];
  for (const [名, lat, lon] of 大陆) {
    assert.ok(!usesWgs84Locally(lat, lon, "apple"), `${名} 被误判成港澳台`);
    assert.ok(distMeters(toWgs84(lat, lon, "apple"), { lat, lon }) > 300, `${名} 应当做 GCJ 换算`);
  }
});

test("境外坐标不做 GCJ 换算 (out_of_china)", () => {
  const apple = { lat: 37.334859, lon: -122.00904 };
  assert.deepEqual(toWgs84(apple.lat, apple.lon, "apple"), apple);
});

test("gcj02ToWgs84 是 wgs84ToGcj02 的逆运算, 残差 < 0.1 米", () => {
  for (const p of [
    { lat: 22.544865, lon: 113.951072 },
    { lat: 39.908823, lon: 116.39747 },
    { lat: 31.230416, lon: 121.473701 },
    { lat: 45.75, lon: 126.63 },
  ]) {
    const g = wgs84ToGcj02(p.lat, p.lon);
    const back = gcj02ToWgs84(g.lat, g.lon);
    assert.ok(distMeters(back, p) < 0.1, `残差 ${distMeters(back, p).toFixed(3)} 米`);
  }
});

test("注入页面的 GCJ 实现与服务端逐点一致", () => {
  // gcj-browser.js 是 parse.js 的镜像副本(页面拿不到服务端函数)。这条测试是那份
  // 副本唯一的防漂移手段 —— 少了它, 两边迟早各改各的。
  const sandbox = {};
  new Function("exports", GCJ_BROWSER_JS + "\nexports.w = wgs84ToGcj02; exports.g = gcj02ToWgs84;")(sandbox);
  for (let la = 20; la <= 50; la += 3.7) {
    for (let lo = 75; lo <= 135; lo += 7.3) {
      assert.deepEqual(sandbox.w(la, lo), wgs84ToGcj02(la, lo), `wgs84ToGcj02(${la},${lo}) 两边不一致`);
      assert.deepEqual(sandbox.g(la, lo), gcj02ToWgs84(la, lo), `gcj02ToWgs84(${la},${lo}) 两边不一致`);
    }
  }
  // 境外分支也要一致
  assert.deepEqual(sandbox.w(37.334859, -122.00904), wgs84ToGcj02(37.334859, -122.00904));
});

test("round6 保留 6 位小数 (约 0.1 米)", () => {
  assert.equal(round6(22.5448651234), 22.544865);
  assert.equal(round6(-122.0090401), -122.00904);
});
