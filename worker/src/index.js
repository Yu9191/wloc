import { Hono } from "hono/tiny";
import { getPageHtml } from "./page.js";
import { parseCoords, gcj02ToWgs84, toWgs84, round6 } from "./parse.js";

const app = new Hono();

app.get("/", (c) => {
  return c.html(getPageHtml());
});

// 地图链接解析: 供快捷指令调用。
// GET /api/parse?u=<链接>&format=json&cs=<gcj|none>
//   返回 {lat, lon, name}; 高德/苹果地图(中国大陆均为 GCJ-02)自动转 WGS84; 境外坐标自动跳过(out_of_china)。cs=none 可强制不转换。
//   不带 format=json 时返回纯文本 "lat=..&lon=.." 片段。
app.get("/api/parse", async (c) => {
  const raw = c.req.query("u") || "";
  const cs = (c.req.query("cs") || "").toLowerCase();
  const fmt = (c.req.query("format") || "").toLowerCase();
  try {
    let { lat, lon, name, src } = await parseCoords(raw);
    // 默认按来源自动换算; cs=none 强制不转换, cs=gcj/bd 强制按指定坐标系转换。
    if (cs === "gcj") ({ lat, lon } = gcj02ToWgs84(lat, lon));
    else if (cs === "bd") ({ lat, lon } = toWgs84(lat, lon, "baidu"));
    else if (cs !== "none") ({ lat, lon } = toWgs84(lat, lon, src));
    lat = round6(lat);
    lon = round6(lon);
    name = name || "";
    c.header("Access-Control-Allow-Origin", "*");
    if (fmt === "json") return c.json({ lat, lon, name });
    return c.text(`lat=${lat}&lon=${lon}`);
  } catch (e) {
    c.header("Access-Control-Allow-Origin", "*");
    return c.json({ error: String(e && e.message ? e.message : e) }, 422);
  }
});

app.onError((e, c) => {
  console.error(`${e}`);
  return c.text(`${e}`, 500);
});

export default app;
