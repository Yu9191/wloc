import { Hono } from "hono/tiny";
import { getPageHtml } from "./page.js";
import { parseCoords, gcj02ToWgs84, round6 } from "./parse.js";

const app = new Hono();

app.get("/", (c) => {
  c.header("Cache-Control", "no-cache, no-store, must-revalidate");
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
//   - 可选 &floor=楼层 (&floorHeight=层高,默认3m): 在地面海拔上叠加 (floor-1)*floorHeight；不带 floor 则返回纯地面海拔。
//   返回 {lat, lon, alt, name}(带 floor 时额外含 ground, floor); 不带 format=json 时返回 "lat=..&lon=..&alt=.." 文本。
app.get("/api/geo", async (c) => {
  const raw = c.req.query("u") || "";
  const cs = (c.req.query("cs") || "").toLowerCase();
  const fmt = (c.req.query("format") || "").toLowerCase();
  const altQ = c.req.query("alt");
  const floorQ = c.req.query("floor");
  const floorHeightQ = c.req.query("floorHeight");
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
    // 经度归一化到 -180..180(容忍 253.125 这类 >180 的输入, 自动 -360)
    if (typeof lon === "number" && !Number.isNaN(lon)) lon = ((((lon + 180) % 360) + 360) % 360) - 180;
    lat = round6(lat);
    lon = round6(lon);

    let alt;
    if (altQ != null && altQ !== "" && !Number.isNaN(parseFloat(altQ))) {
      alt = parseFloat(altQ);
    } else {
      alt = await lookupElevation(lat, lon);
    }
    // 可选: 叠加楼层离地高度 alt += (floor-1) * floorHeight(默认层高 3m)。不带 floor 则返回纯地面海拔。
    const ground = alt;
    let floor = null;
    if (floorQ != null && floorQ !== "" && !Number.isNaN(parseInt(floorQ, 10))) {
      floor = parseInt(floorQ, 10);
      let fh = 3;
      if (floorHeightQ != null && floorHeightQ !== "" && !Number.isNaN(parseFloat(floorHeightQ))) fh = parseFloat(floorHeightQ);
      alt = Math.round((ground + (floor - 1) * fh) * 10) / 10;
    }
    name = name || "";
    if (fmt === "json") return c.json(floor != null ? { lat, lon, alt, ground, floor, name } : { lat, lon, alt, name });
    return c.text(`lat=${lat}&lon=${lon}&alt=${alt}`);
  } catch (e) {
    return c.json({ error: String(e && e.message ? e.message : e) }, 422);
  }
});

// 查询某坐标地面海拔(米): 多数据源容错(open-meteo 主, opentopodata 备)。
// open-meteo 对 Cloudflare 边缘共享 IP 偶发限流(429), 海外坐标更易触发, 故加备用源。
async function lookupElevation(lat, lon) {
  const sources = [
    {
      name: "open-meteo",
      url: `https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lon}`,
      pick: (d) => (Array.isArray(d.elevation) ? d.elevation[0] : d.elevation),
    },
    {
      name: "opentopodata",
      url: `https://api.opentopodata.org/v1/aster30m?locations=${lat},${lon}`,
      pick: (d) => (Array.isArray(d.results) && d.results[0] ? d.results[0].elevation : undefined),
    },
  ];
  let lastErr = "no source";
  for (const s of sources) {
    try {
      const resp = await fetch(s.url, { headers: { accept: "application/json" } });
      if (!resp.ok) {
        lastErr = `${s.name} ${resp.status}`;
        continue;
      }
      const data = await resp.json();
      const elev = s.pick(data);
      if (typeof elev !== "number" || Number.isNaN(elev)) {
        lastErr = `${s.name} 解析失败`;
        continue;
      }
      return Math.round(elev * 10) / 10;
    } catch (e) {
      lastErr = `${s.name} ${e && e.message ? e.message : e}`;
    }
  }
  throw new Error(`elevation api 全部失败: ${lastErr}`);
}

app.onError((e, c) => {
  console.error(`${e}`);
  return c.text(`${e}`, 500);
});

export default app;
