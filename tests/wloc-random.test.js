const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const script = fs.readFileSync(
  path.join(__dirname, "..", "dist", "wloc.js"),
  "utf8",
);

function varint(value) {
  const bytes = [];
  let remaining = value;
  while (remaining >= 128) {
    bytes.push((remaining % 128) | 128);
    remaining = Math.floor(remaining / 128);
  }
  bytes.push(remaining);
  return bytes;
}

function field(number, wireType, value) {
  const tag = varint(number * 8 + wireType);
  return wireType === 0
    ? [...tag, ...varint(value)]
    : [...tag, ...varint(value.length), ...value];
}

function locationRecord() {
  return [
    ...field(1, 0, 1),
    ...field(2, 0, 1),
    ...field(3, 0, 5),
  ];
}

function wifiRecord(mac) {
  return [
    ...field(1, 2, Array.from(Buffer.from(mac))),
    ...field(2, 2, locationRecord()),
  ];
}

function responseFixture() {
  const payload = [
    ...field(2, 2, wifiRecord("00:11:22:33:44:55")),
    ...field(2, 2, wifiRecord("66:77:88:99:aa:bb")),
  ];
  return [...new Array(8).fill(0), payload.length >> 8, payload.length & 255, ...payload];
}

function readVarint(bytes, start) {
  let value = 0;
  let factor = 1;
  let offset = start;
  while (offset < bytes.length) {
    const byte = bytes[offset++];
    value += (byte & 127) * factor;
    if (!(byte & 128)) return [value, offset];
    factor *= 128;
  }
  throw new Error("truncated varint");
}

function readFields(bytes) {
  const fields = [];
  let offset = 0;
  while (offset < bytes.length) {
    const [tag, valueOffset] = readVarint(bytes, offset);
    offset = valueOffset;
    const number = Math.floor(tag / 8);
    const wireType = tag & 7;
    if (wireType === 0) {
      const [value, nextOffset] = readVarint(bytes, offset);
      fields.push({ number, wireType, value });
      offset = nextOffset;
    } else if (wireType === 2) {
      const [length, dataOffset] = readVarint(bytes, offset);
      fields.push({
        number,
        wireType,
        value: bytes.slice(dataOffset, dataOffset + length),
      });
      offset = dataOffset + length;
    } else {
      throw new Error(`unsupported wire type ${wireType}`);
    }
  }
  return fields;
}

function extractLocations(response) {
  const bytes = Array.from((response.response || response).bodyBytes);
  const length = (bytes[8] << 8) | bytes[9];
  const payload = bytes.slice(10, 10 + length);
  return readFields(payload)
    .filter((item) => item.number === 2 && item.wireType === 2)
    .map((item) => {
      const wifi = readFields(item.value);
      const location = readFields(
        wifi.find((field) => field.number === 2 && field.wireType === 2).value,
      );
      return {
        latitude:
          location.find((field) => field.number === 1 && field.wireType === 0)
            .value / 1e8,
        longitude:
          location.find((field) => field.number === 2 && field.wireType === 0)
            .value / 1e8,
      };
    });
}

function distanceMeters(a, b) {
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const deltaLat = lat2 - lat1;
  const deltaLon = toRadians(b.longitude - a.longitude);
  const h =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 2 * 6378137 * Math.asin(Math.sqrt(h));
}

async function runWloc(randomRadius, randomValues, storedSettings = null) {
  let randomIndex = 0;
  const contextMath = Object.create(Math);
  contextMath.random = () => randomValues[randomIndex++ % randomValues.length];
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("wloc script timed out")), 500);
    const context = {
      Egern: {},
      Math: contextMath,
      console: { log() {} },
      $argument: `longitude=121.4737&latitude=31.2304&accuracy=25&randomRadius=${randomRadius}&logLevel=off`,
      $persistentStore: {
        read: (key) =>
          key === "wloc_settings" && storedSettings
            ? JSON.stringify(storedSettings)
            : null,
        write: () => true,
      },
      $request: { url: "https://gs-loc.apple.com/clls/wloc" },
      $response: { bodyBytes: responseFixture(), headers: {} },
      $done(result) {
        clearTimeout(timeout);
        resolve(result);
      },
    };
    try {
      vm.runInNewContext(script, context);
    } catch (error) {
      clearTimeout(timeout);
      reject(error);
    }
  });
}

test("randomizes once per response and stays inside the configured radius", async () => {
  const center = { longitude: 121.4737, latitude: 31.2304 };
  const first = extractLocations(await runWloc(30, [0.25, 0]));
  const second = extractLocations(await runWloc(30, [1, 0.25]));

  assert.equal(first.length, 2);
  assert.deepEqual(first[0], first[1]);
  assert.deepEqual(second[0], second[1]);
  assert.notDeepEqual(first[0], second[0]);
  assert.ok(Math.abs(distanceMeters(center, first[0]) - 15) < 0.01);
  assert.ok(Math.abs(distanceMeters(center, second[0]) - 30) < 0.01);
});

test("a zero radius disables coordinate perturbation", async () => {
  const locations = extractLocations(await runWloc(0, [1, 0.5]));
  assert.deepEqual(locations, [
    { longitude: 121.4737, latitude: 31.2304 },
    { longitude: 121.4737, latitude: 31.2304 },
  ]);
});

test("also perturbs coordinates loaded from persistent settings", async () => {
  const center = { longitude: 116.397, latitude: 39.908 };
  const locations = extractLocations(
    await runWloc(30, [0.25, 0], { ...center, accuracy: 25 }),
  );

  assert.ok(Math.abs(distanceMeters(center, locations[0]) - 15) < 0.01);
  assert.deepEqual(locations[0], locations[1]);
});
