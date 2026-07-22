import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";

import {
  gcj02ToWgs84,
  getClientCoordinateHelpersSource,
  inferCoordinateSystem,
  layerToWgs84,
  normalizeToWgs84,
  wgs84ToGcj02,
  wgs84ToLayer,
} from "../src/coordinates.js";
import { getPageHtml } from "../src/page.js";

// Public landmark sample near Tiananmen Square, not a user location.
const BEIJING_WGS84 = { lat: 39.908722, lon: 116.397499 };
const BEIJING_GCJ02 = { lat: 39.91012550007891, lon: 116.4037425752605 };

function assertPointClose(actual, expected, tolerance = 1e-9) {
  assert.ok(Math.abs(actual.lat - expected.lat) < tolerance, `${actual.lat} != ${expected.lat}`);
  assert.ok(Math.abs(actual.lon - expected.lon) < tolerance, `${actual.lon} != ${expected.lon}`);
}

test("converts mainland coordinates between WGS84 and GCJ-02", () => {
  assertPointClose(
    wgs84ToGcj02(BEIJING_WGS84.lat, BEIJING_WGS84.lon),
    BEIJING_GCJ02
  );
  assertPointClose(
    gcj02ToWgs84(BEIJING_GCJ02.lat, BEIJING_GCJ02.lon),
    BEIJING_WGS84
  );
  assertPointClose(
    layerToWgs84(BEIJING_GCJ02.lat, BEIJING_GCJ02.lon, "amap"),
    BEIJING_WGS84
  );
  assertPointClose(
    wgs84ToLayer(BEIJING_WGS84.lat, BEIJING_WGS84.lon, "amap"),
    BEIJING_GCJ02
  );
});

test("leaves coordinates outside mainland China unchanged", () => {
  const london = { lat: 51.5074, lon: -0.1278 };
  assert.deepEqual(wgs84ToGcj02(london.lat, london.lon), london);
  assert.deepEqual(gcj02ToWgs84(london.lat, london.lon), london);
});

test("normalizes Apple and Amap inputs while keeping raw coordinates as WGS84", () => {
  assert.equal(inferCoordinateSystem("https://maps.apple.com/?ll=39.9,116.4"), "gcj02");
  assert.equal(
    inferCoordinateSystem("https://uri.amap.com/marker?lnglat=116.4,39.9"),
    "gcj02"
  );
  assert.equal(inferCoordinateSystem("https://maps.google.com/?q=39.9,116.4"), "wgs84");
  assert.equal(inferCoordinateSystem("39.9,116.4"), "wgs84");

  const normalized = normalizeToWgs84({ ...BEIJING_GCJ02, coordinateSystem: "gcj02" });
  assertPointClose(normalized, BEIJING_WGS84);
  assert.equal(normalized.coordinateSystem, "wgs84");
});

test("generated browser helpers match the Worker implementation", () => {
  const leafletMap = () => "leaflet-sentinel";
  const context = vm.createContext({ L: { map: leafletMap } });
  const script =
    getClientCoordinateHelpersSource() +
    "\nglobalThis.result = layerToWgs84(39.91012550007891, 116.4037425752605, 'amap');" +
    "\nglobalThis.leafletMap = L.map;";
  new vm.Script(script, { filename: "client-coordinate-helpers.js" }).runInContext(context);

  assertPointClose(context.result, BEIJING_WGS84);
  assert.equal(context.leafletMap, leafletMap, "coordinate helpers must not shadow Leaflet's L");
});

test("page stores canonical WGS84 coordinates for map and pasted inputs", () => {
  const html = getPageHtml();
  assert.match(html, /const canonical = layerToWgs84\(displayLat, displayLon, currentLayerName\)/);
  assert.match(html, /const result = normalizeToWgs84\(parseMapUrl\(input\)\)/);
  assert.doesNotMatch(html, /\$\{getClientCoordinateHelpersSource\(\)\}/);

  const inlineScripts = [...html.matchAll(/<script(?: [^>]*)?>([\s\S]*?)<\/script>/g)];
  const inlineScript = inlineScripts.at(-1)?.[1];
  assert.ok(inlineScript, "generated page must contain an inline script");
  assert.doesNotThrow(() => new vm.Script(inlineScript, { filename: "wloc-page.js" }));
});
