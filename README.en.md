<p align="center">
  <a href="./README.md">简体中文</a> · <strong>English</strong>
</p>

<p align="center">
  <img src="wloc.jpg" width="144" />
</p>

# Apple WLOC Location Modification

Modify the coordinates returned by Apple's network location service (WiFi/cell towers) to spoof iOS network-based location. Simply choose a location on the online map for it to take effect—there is no need to enter latitude and longitude manually.

---

## Subscription URLs

**Surge:**
https://raw.githubusercontent.com/Yu9191/wloc/refs/heads/main/modules/wloc.sgmodule

**Quantumult X:**
https://raw.githubusercontent.com/Yu9191/wloc/refs/heads/main/modules/wloc.conf

**Loon:**
https://raw.githubusercontent.com/Yu9191/wloc/refs/heads/main/modules/wloc.lpx

**Stash:**
https://raw.githubusercontent.com/Yu9191/wloc/refs/heads/main/modules/wloc.stoverride

**Shadowrocket:**
https://raw.githubusercontent.com/Yu9191/wloc/refs/heads/main/modules/wloc.module

> Egern can use the Surge module directly.
> For Stash, subscribe directly to the `.stoverride` above; no Script Hub conversion is required.

---

## Shortcuts (Recommended and Most Convenient)

Use the shortcuts to switch or clear the location directly, without opening the location picker:

- **wloc Set Location**: https://www.icloud.com/shortcuts/a82717d8fdad4e6280866fcf911173f7
- **wloc Clear and Restore Location**: https://www.icloud.com/shortcuts/f42632d406504f24a2cd163af4fe012f

**Usage**

- **Set a location:** Choose a location in a map app (press and hold the map) → Share → select "wloc Set Location" to switch.
  - Apple Maps: Choose a location → Share → "wloc Set Location"
  - Amap: Choose a location → Share → **More** → "wloc Set Location"
- **Clear the location:** Tap "wloc Clear and Restore Location" to restore your real location.

Supports Apple Maps and Amap, including short links, automatic redirect following, and GCJ-02→WGS84 coordinate conversion.

> Prerequisites: the proxy is running + the module is enabled + `gs-loc.apple.com` is trusted. The location picker (Worker / Pages) option remains available below.

---

### About Map Link Parsing (Worker)

To process Apple Maps and Amap through the same flow, links are sent to `wloc-spoofer.wloc.workers.dev/api/parse` for parsing:

- **Amap:** Shared links are short links. The real coordinates exist only in the `Location` header of the 302 redirect and use the offset GCJ-02 coordinate system. Because Shortcuts cannot read the redirect header or easily convert coordinates, the worker follows the redirect → extracts the coordinates → converts GCJ-02→WGS84 → returns the latitude and longitude.
- **Apple Maps:** The link directly contains `coordinate=latitude,longitude`, but coordinates in **mainland China also use the offset GCJ-02 coordinate system**. As with Amap, the worker converts GCJ-02→WGS84 before returning them. Coordinates outside China skip conversion automatically (determined by `out_of_china`) and are returned unchanged. Besides unifying the coordinate system, using the same endpoint also provides consistent handling for short links, links embedded in text, name decoding, and more.

**Privacy:** `/api/parse` is a pure forwarding parser—it receives the link → follows redirects → parses coordinates → returns JSON. It never writes to storage, records logs, or caches data; everything is discarded after processing.

**Self-host if you prefer:** The worker source code is fully open source, so you can deploy your own instance and replace the address above:

- Parsing logic: [`worker/src/parse.js`](worker/src/parse.js); routing: [`worker/src/index.js`](worker/src/index.js)
- After deployment, replace `wloc-spoofer.wloc.workers.dev` in the shortcuts with your own worker domain.

---

<details>
<summary><b>Usage</b></summary>

1. Subscribe to the module and enable MITM
2. Open the online location picker (public Worker; adding it to your Home Screen is recommended)
3. Choose a location on the map / search for a place / paste a map link
4. Tap "Save to Device"
5. The location takes effect automatically the next time Apple location is triggered

Supports link parsing for Apple Maps / Google Maps / Amap / Baidu Maps / coordinate text.

> **Note for iOS 26/27 and later:** Starting with iOS 26, Apple significantly strengthened `locationd` location caching. The system may cache a previously obtained real location in memory and reuse it for a long time. This means that after installing the module or switching the target coordinates, the system may continue using the old cached coordinates even when the script has successfully modified the WLOC response (the log says "modified"), making the location appear unchanged.
>
> **Solution: restart the device.** Restarting clears the in-memory `locationd` cache. When the system sends another WLOC request, it receives the modified coordinates. On iOS 26+, toggling Airplane Mode or turning Location Services off **cannot** clear this cache; a restart is required. iOS 15–18 usually applies the change without a restart.

**Recommended procedure for newer systems (highest success rate):**

Method 1:
1. Choose the desired location on the location picker and save it to the device
2. Enable Airplane Mode → turn off Location Services → restart the device
3. Disable Airplane Mode (also turn off WiFi) → connect the proxy tool (confirm that the VPN icon appears) → turn on Location Services
4. Open a map app to verify

Method 2:
1. Turn off Location Services
2. Choose a location on the location picker and save it to the device
3. Turn on Location Services → when "Allow Location Access" appears, select **"Ask Next Time Or When I Share"**
4. Open a map app to verify

</details>

<details>
<summary><b>How It Works</b></summary>

```
选点页面 → fetch gs-loc.apple.com/wloc-settings/save?lon=x&lat=y
         → 代理模块拦截 → wloc-settings.js 写入 $persistentStore
         → 下次 WLOC 触发 → wloc.js 读取坐标 → patch protobuf 响应
```

The module contains two rules:
- `wloc.js` — intercepts the `/clls/wloc` response, parses protobuf, and replaces the coordinates
- `wloc-settings.js` — intercepts the `/wloc-settings/save` request and writes to persistent storage

</details>

<details>
<summary><b>Parameter Configuration</b></summary>

| Parameter | Description | Default |
|------|------|--------|
| longitude | Target longitude (online picker takes priority) | null (pass-through) |
| latitude | Target latitude (online picker takes priority) | null (pass-through) |
| accuracy | Accuracy (meters) | 25 |
| logLevel | Log level | info |

Priority: location saved by the online picker > module parameters > defaults

</details>

<details>
<summary><b>Disable Location Spoofing / Restore the Real Location</b></summary>

**Method 1: Disable or remove the module** (recommended)

After the module is disabled, the script stops intercepting WLOC requests and the system automatically restores the real location. On iOS 26+, restart the device to clear the location cache.

**Method 2: Clear persistent data (pass-through mode)**

After the saved coordinates are cleared, the script enters **pass-through mode**—it does not modify the WLOC response and passes the original data through, allowing the system to restore the real GPS location automatically.

**Condition for pass-through mode:** When the persistent data is empty (null) and the module parameters use the default values (113.94114, 22.544577), the script determines that the user has not customized the coordinates and automatically skips modification. There is no need to change the module's default parameters; simply clear the persistent data to enter pass-through mode.

Delete the persistent data named `wloc_settings` in your proxy tool:

- **Surge** — run in the script editor: `$persistentStore.write(null, "wloc_settings")`
- **Quantumult X** — run: `$prefs.removeValueForKey("wloc_settings")`
- **Loon** — run: `$persistentStore.write(null, "wloc_settings")`

Restart the device after clearing the data to restore the real location. You do not need to disable the module; the script automatically detects that no custom coordinates exist and skips modification.

> **Note:** If the user manually changes the latitude and longitude in the module parameters (instead of the defaults 113.94114, 22.544577), the script will still use those module parameters to modify the coordinates after persistent data is cleared. Clearing persistent data enters pass-through mode only when the default parameters remain unchanged.

</details>

<details>
<summary><b>Favorite Locations</b></summary>

The online location picker can save multiple favorite locations for convenient switching:

- **Add a favorite:** Choose a location and tap "Favorite Location" → enter a label (Chinese, English, and numbers are supported; maximum 30 characters) → Save
- **Quick switch:** Tap a location in the favorites list → the map jumps there automatically → tap "Save to Device" to switch
- **Active marker:** A favorite matching the coordinates saved on the device displays "✓ Active"
- **Delete:** Delete a single favorite (× button) or clear all
- **Active coordinates:** The page displays the device's persistent data (wloc_settings), with options to refresh, query, and clear it

**Data storage:**
- **Favorites list** → saved in the browser's `localStorage` (used only for convenient location-picker UI interactions)
- **Active coordinates** → saved in the proxy tool's persistent storage, `$persistentStore` (the data actually read when the script runs)

The two are stored independently. The favorites list is browser-side helper data. After clearing the browser cache or switching browsers, you must add favorites again, but this does not affect the active coordinates saved on the device.

</details>

<details>
<summary><b>Self-host a Worker (Recommended)</b></summary>

The public location picker has a request limit, so deploying your own instance is recommended:

- **Workers**: `https://wloc-spoofer.wloc.workers.dev/`
- **Pages**: `https://wloc-pages.pages.dev/`

**One-click deployment (Workers):**

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Yu9191/wloc/tree/main/worker)

> One-click deployment supports Workers mode only. Click the button and follow the prompts to authorize and complete the deployment.

**Manual deployment (Workers):**

```bash
# 1. 克隆仓库
git clone https://github.com/Yu9191/wloc.git
cd wloc/worker

# 2. 安装依赖
npm install

# 3. 登录 Cloudflare（首次需要）
npx wrangler login

# 4. 部署
npm run deploy
```

After a successful deployment, you will receive your own Worker URL (for example, `https://wloc-spoofer.<your-subdomain>.workers.dev`). Use that URL to choose locations.

> The free plan includes 100,000 requests per day, which is more than enough for personal use.

<details>
<summary>Advanced: Pages Deployment</summary>

Pages deployment does not support the one-click button and must be performed manually:

```bash
git clone https://github.com/Yu9191/wloc.git
cd wloc/worker
npm install
npx wrangler pages deploy dist --project-name <自定义项目名>
```

During deployment, you will be prompted to set the production branch; enter `main`. After deployment, you will receive a `https://<project-name>.pages.dev` URL.

Pages and Workers provide the same features; choose whichever suits your needs.

</details>

</details>

<details>
<summary><b>Notes</b></summary>

- The MITM certificate must trust `gs-loc.apple.com` and `gs-loc-cn.apple.com`
- Only network-based location (WiFi/cell towers) is modified; GPS hardware location is unaffected
- iOS may ignore network location results when the GPS signal is strong
- Works best in indoor environments that primarily use WiFi positioning
- The location picker must be used in proxy mode (Safari must use the proxy so the save request can be intercepted)

</details>

---

## Acknowledgments

- [proxypin-wloc-spoofer](https://github.com/FFF686868/proxypin-wloc-spoofer) - original WLOC location modification concept by FFF686868
- [NSNanoCat/Util](https://github.com/NSNanoCat/util) - cross-platform scripting framework
