// 零依赖的请求处理器: 仅用标准 Web API (Request / Response / URL / fetch),
// 因此同一份代码可跑在 Cloudflare Workers、Cloudflare Pages Functions 与
// 腾讯云 EdgeOne Pages (edge-functions) 三套运行时上, 无需任何 npm 包。
//
// 之所以放弃 Hono: EdgeOne 的边缘函数(V8 运行时)明确不支持 npm 包,
// 而 Worker / Pages 也只需最朴素的两个路由, 引入框架反而增加冷启动与打包风险。
import { getPageHtml } from "./page.js";
import { parseCoords, gcj02ToWgs84, toWgs84, round6, inRange } from "./parse.js";

const CORS = { "Access-Control-Allow-Origin": "*" };

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}

// GET /api/parse?u=<链接>&format=json&cs=<gcj|bd|none>
//   返回 {lat, lon, name}; 高德/苹果地图(中国大陆均为 GCJ-02)自动转 WGS84;
//   境外坐标自动跳过(out_of_china)。cs=none 强制不转换, cs=gcj/bd 强制按指定坐标系转换。
//   不带 format=json 时返回纯文本 "lat=..&lon=.." 片段, 供快捷指令直接拼接。
async function handleParse(request) {
  const url = new URL(request.url);
  const raw = url.searchParams.get("u") || "";
  const cs = (url.searchParams.get("cs") || "").toLowerCase();
  const fmt = (url.searchParams.get("format") || "").toLowerCase();
  try {
    let { lat, lon, name, src } = await parseCoords(raw);
    // 默认按来源自动换算; cs=none 强制不转换, cs=gcj/bd 强制按指定坐标系转换。
    if (cs === "gcj") ({ lat, lon } = gcj02ToWgs84(lat, lon));
    else if (cs === "bd") ({ lat, lon } = toWgs84(lat, lon, "baidu"));
    else if (cs !== "none") ({ lat, lon } = toWgs84(lat, lon, src));
    // 出口再校验一次: cs= 是调用方指定的, 强行按错误坐标系换算也可能把值推出值域。
    // 宁可报错也不要返回一个能被当成坐标写进设备的数字。
    if (!inRange(lat, lon)) throw new Error("解析出的坐标超出合法范围");
    lat = round6(lat);
    lon = round6(lon);
    name = name || "";
    if (fmt === "json") return json({ lat, lon, name }, 200, CORS);
    return new Response(`lat=${lat}&lon=${lon}`, {
      headers: { ...CORS, "content-type": "text/plain; charset=utf-8" },
    });
  } catch (e) {
    return json({ error: String(e && e.message ? e.message : e) }, 422, CORS);
  }
}

// 平台无关入口。三个运行时都通过各自的适配器把标准 Request 喂进来:
//   Cloudflare Workers  -> export default { fetch } 直接调它
//   Cloudflare Pages    -> functions/[[route]].js 的 onRequest(ctx) 调 handleRequest(ctx.request)
//   EdgeOne Pages       -> edge-functions 的 onRequest(ctx) 调 handleRequest(ctx.request)
export async function handleRequest(request) {
  const url = new URL(request.url);
  const path = url.pathname;
  try {
    if (path === "/" || path === "/index.html") {
      return new Response(getPageHtml(), {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-cache",
        },
      });
    }
    if (path === "/api/parse") {
      return await handleParse(request);
    }
    return new Response("Not Found", { status: 404, headers: CORS });
  } catch (e) {
    // 兜底 500 也要带 CORS —— 否则快捷指令那边看到的是跨域错误, 而不是真正的原因。
    return new Response(String(e && e.message ? e.message : e), {
      status: 500,
      headers: CORS,
    });
  }
}

// Cloudflare Workers 入口 (wrangler.jsonc 的 main 指向本文件)。
export default {
  async fetch(request) {
    return handleRequest(request);
  },
};
