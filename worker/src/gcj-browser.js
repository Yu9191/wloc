// 浏览器端 GCJ-02 换算, 以字符串形式注入选点页面。
//
// 为什么是字符串而不是正常的 export: page.js 整体是一个模板串, 页面里的 JS 跑在
// 浏览器, 而 parse.js 的实现跑在 Worker 里 —— 地图点击事件拿不到服务端函数。
// 用字符串注入而不是 fn.toString(), 是因为部署走 `wrangler deploy --minify`,
// 压缩会重命名标识符, toString() 出来的代码引用的是压缩后的名字, 注入到页面的
// 新作用域里会全部对不上。字符串字面量的内容 esbuild 不会碰。
//
// 这是 parse.js 中同名函数的镜像。test/parse.test.mjs 会在多个采样点上逐一比对
// 两份实现的输出, 任何一边改了另一边没跟上, 测试立刻变红。
export const GCJ_BROWSER_JS = `
var GCJ_A = 6378245.0, GCJ_EE = 0.00669342162296594323;
function gcjOutOfChina(lng, la) {
  return lng < 72.004 || lng > 137.8347 || la < 0.8293 || la > 55.8271;
}
function gcjDeltaLat(x, y) {
  var r = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  r += ((20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0) / 3.0;
  r += ((20.0 * Math.sin(y * Math.PI) + 40.0 * Math.sin((y / 3.0) * Math.PI)) * 2.0) / 3.0;
  r += ((160.0 * Math.sin((y / 12.0) * Math.PI) + 320 * Math.sin((y * Math.PI) / 30.0)) * 2.0) / 3.0;
  return r;
}
function gcjDeltaLon(x, y) {
  var r = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  r += ((20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0) / 3.0;
  r += ((20.0 * Math.sin(x * Math.PI) + 40.0 * Math.sin((x / 3.0) * Math.PI)) * 2.0) / 3.0;
  r += ((150.0 * Math.sin((x / 12.0) * Math.PI) + 300.0 * Math.sin((x / 30.0) * Math.PI)) * 2.0) / 3.0;
  return r;
}
function wgs84ToGcj02(lat, lon) {
  if (gcjOutOfChina(lon, lat)) return { lat: lat, lon: lon };
  var dLat = gcjDeltaLat(lon - 105.0, lat - 35.0);
  var dLon = gcjDeltaLon(lon - 105.0, lat - 35.0);
  var radLat = (lat / 180.0) * Math.PI;
  var magic = Math.sin(radLat);
  magic = 1 - GCJ_EE * magic * magic;
  var sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180.0) / (((GCJ_A * (1 - GCJ_EE)) / (magic * sqrtMagic)) * Math.PI);
  dLon = (dLon * 180.0) / ((GCJ_A / sqrtMagic) * Math.cos(radLat) * Math.PI);
  return { lat: lat + dLat, lon: lon + dLon };
}
function gcj02ToWgs84(lat, lon) {
  if (gcjOutOfChina(lon, lat)) return { lat: lat, lon: lon };
  var wgsLat = lat, wgsLon = lon;
  for (var i = 0; i < 6; i++) {
    var g = wgs84ToGcj02(wgsLat, wgsLon);
    var errLat = g.lat - lat, errLon = g.lon - lon;
    if (Math.abs(errLat) < 1e-9 && Math.abs(errLon) < 1e-9) break;
    wgsLat -= errLat;
    wgsLon -= errLon;
  }
  return { lat: wgsLat, lon: wgsLon };
}
`;
