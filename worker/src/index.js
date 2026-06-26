import { Hono } from "hono/tiny";
import { getPageHtml } from "./page.js";
import { parseCoords, gcj02ToWgs84, round6 } from "./parse.js";

const app = new Hono();

app.get("/", (c) => {
  return c.html(getPageHtml());
});

// 地图链接解析: 供快捷指令调用。
// GET /api/parse?u=<链接>&format=json&cs=<gcj|none>
//   返回 {lat, lon, name}; 高德(GCJ-02)自动转 WGS84, 苹果地图原样。
//   不带 format=json 时返回纯文本 "lat=..&lon=.." 片段。
app.get("/api/parse", async (c) => {
  const raw = c.req.query("u") || "";
  const cs = (c.req.query("cs") || "").toLowerCase();
  const fmt = (c.req.query("format") || "").toLowerCase();
  try {
    let { lat, lon, name, src } = await parseCoords(raw);
    const needConv = cs === "gcj" || (cs !== "none" && src === "amap");
    if (needConv) ({ lat, lon } = gcj02ToWgs84(lat, lon));
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

// 海拔查询: 新增独立路径，不影响 / 与 /api/parse。
// GET /api/geo?u=<地图链接>&cs=<gcj|none>&alt=<可选海拔>&format=json
//   或 GET /api/geo?lat=..&lon=..&alt=..
//   - 提供 alt 时原样回显；否则按坐标查公开高程 API(open-meteo) 取地面海拔。
//   返回 {lat, lon, alt, name}; 不带 format=json 时返回 "lat=..&lon=..&alt=.." 文本。
app.get("/api/geo", async (c) => {
  const raw = c.req.query("u") || "";
  const cs = (c.req.query("cs") || "").toLowerCase();
  const fmt = (c.req.query("format") || "").toLowerCase();
  const altQ = c.req.query("alt");
  const latQ = c.req.query("lat");
  const lonQ = c.req.query("lon");
  c.header("Access-Control-Allow-Origin", "*");
  try {
    let lat;
    let lon;
    let name = "";
    if (raw) {
      let src;
      ({ lat, lon, name, src } = await parseCoords(raw));
      const needConv = cs === "gcj" || (cs !== "none" && src === "amap");
      if (needConv) ({ lat, lon } = gcj02ToWgs84(lat, lon));
    } else if (latQ != null && lonQ != null) {
      lat = parseFloat(latQ);
      lon = parseFloat(lonQ);
      if (Number.isNaN(lat) || Number.isNaN(lon)) throw new Error("lat/lon 无效");
      if (cs === "gcj") ({ lat, lon } = gcj02ToWgs84(lat, lon));
    } else {
      throw new Error("缺少 u 或 lat/lon 参数");
    }
    lat = round6(lat);
    lon = round6(lon);

    let alt;
    if (altQ != null && altQ !== "" && !Number.isNaN(parseFloat(altQ))) {
      alt = parseFloat(altQ);
    } else {
      alt = await lookupElevation(lat, lon);
    }
    name = name || "";
    if (fmt === "json") return c.json({ lat, lon, alt, name });
    return c.text(`lat=${lat}&lon=${lon}&alt=${alt}`);
  } catch (e) {
    return c.json({ error: String(e && e.message ? e.message : e) }, 422);
  }
});

// 查询某坐标地面海拔(米): open-meteo 免费、无需 key
async function lookupElevation(lat, lon) {
  const url = `https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lon}`;
  const resp = await fetch(url, { headers: { accept: "application/json" } });
  if (!resp.ok) throw new Error(`elevation api ${resp.status}`);
  const data = await resp.json();
  const elev = Array.isArray(data.elevation) ? data.elevation[0] : data.elevation;
  if (typeof elev !== "number" || Number.isNaN(elev)) throw new Error("elevation 解析失败");
  return Math.round(elev * 10) / 10;
}

app.onError((e, c) => {
  console.error(`${e}`);
  return c.text(`${e}`, 500);
});

export default app;
