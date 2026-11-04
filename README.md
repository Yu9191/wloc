<p align="center">
  <img src="wloc.jpg" width="144" />
</p>

# Apple WLOC 定位修改

修改 Apple 网络定位服务 (WiFi/基站) 返回的坐标，实现 iOS 网络定位虚拟定位。打开在线选点页面选位置即可生效，无需手动填经纬度。

> ⚠️ **2026-11-04 更新：iOS 26 上也开始出现同样的情况，iOS 18 上也有反馈。**
>
> 2026-11-04 起，多位用户在 Issues 反馈，对 `gs-loc.apple.com` / `gs-loc-cn.apple.com` 的 MITM 拦截突然失效，提示「此服务器的证书无效」或「未受信任」：
>
> - iOS 26.2.1、26.5、26.7、26.7.2：[#121](https://github.com/Yu9191/wloc/issues/121)、[#123](https://github.com/Yu9191/wloc/issues/123)
> - iOS 18.5、18.7.1、18.7.7：[#122](https://github.com/Yu9191/wloc/issues/122)
>
> 有设备并没有更新过系统（[#123](https://github.com/Yu9191/wloc/issues/123)），也有用户反馈是**重启设备之后**才失效的。另有用户反馈，同一张 CA 拦截 `example.com` 等非 Apple 域名仍然正常，只有 `*.apple.com` 被拒（[#123](https://github.com/Yu9191/wloc/issues/123)），现象和下面 iOS 27 beta 6 起的限制相似。
>
> **目前还没有确认原因**，也不清楚是不是所有设备都会遇到：是 Apple 把校验收紧到了更多版本，还是别的原因，现在都没有测试数据。有用户猜测是 Apple 侧对非官方证书的统一封锁，同样没有证实。
>
> **在查清楚之前：** 现在还能用的设备，建议先不要重启，也不要升级系统。已经失效的设备，请把精确到小数点后的系统版本、代理工具及版本、有没有更新或重启过、报错截图补充到上面的 Issue 里，不要重复开新的。

> ⚠️ **iOS 27 beta 6 起，系统已禁止对 `gs-loc.apple.com` / `gs-loc-cn.apple.com` 进行 MITM 拦截，本项目在这些版本上无法使用。**
>
> 实测（beta 8）确认限制发生在 **TLS 证书校验层**：`locationd` 仍然正常走系统代理，请求确实到得了中间人，但它会拒绝任何非 Apple CA 签发的证书 —— 即使该 CA 已在「证书信任设置」里打开完全信任（同一台设备、同一张 CA 拦截其他域名是成功的）。
>
> 由于校验发生在设备内部的 `locationd` 进程中，**改用软路由 / 网关侧透明代理 / 换其他 MITM 工具同样无效** —— 这些方案改变的只是流量路径，而问题出在路径终点。完整测试数据见 [#113](https://github.com/Yu9191/wloc/issues/113)。
>
> 目前只能停留在受影响版本之前的系统。

---

## 订阅地址

**Surge:**
https://raw.githubusercontent.com/Yu9191/wloc/refs/heads/main/modules/wloc.sgmodule

**Quantumult X:**
https://raw.githubusercontent.com/Yu9191/wloc/refs/heads/main/modules/wloc.conf

**Loon:**
https://raw.githubusercontent.com/Yu9191/wloc/refs/heads/main/modules/wloc.lpx

**Stash:**
https://raw.githubusercontent.com/Yu9191/wloc/refs/heads/main/modules/wloc.stoverride

**Shadowrocket(小火箭):**
https://raw.githubusercontent.com/Yu9191/wloc/refs/heads/main/modules/wloc.module

> Egern 可直接使用 Surge 模块
> Stash 请直接订阅上面的 `.stoverride`，无需用 Script Hub 转换

### 默认扩展域名支持

默认模块已覆盖目前已知的完整 WLOC 域名集合：

- `gsp-ssl.ls.apple.com`
- `bluedot.is.autonavi.com`
- `bluedot.is.autonavi.com.gds.alibabadns.com`


---

## 快捷指令（推荐，最方便）

直接用快捷指令切换 / 清除定位，无需打开选点页面：

- **wloc 设置地理位置**：https://www.icloud.com/shortcuts/a82717d8fdad4e6280866fcf911173f7
- **wloc 清理恢复位置**：https://www.icloud.com/shortcuts/f42632d406504f24a2cd163af4fe012f

**用法**

- **设置位置：** 在地图 App 里选好位置（长按地图选点）→ 共享 → 选「wloc 设置地理位置」即可切换。
  - 苹果地图：选点 → 共享 → 「wloc 设置地理位置」
  - 高德地图：选点 → 分享 → **更多** → 「wloc 设置地理位置」
- **清理位置：** 点「wloc 清理恢复位置」即可恢复真实定位。

支持苹果地图、高德（含短链，自动跟跳转 + GCJ-02→WGS84 坐标换算）。

> 前提：代理已开 + 模块已启用 + 信任 `gs-loc.apple.com`。选点页面（Worker / Pages）方案仍保留，见下方。

---

### 关于地图链接解析（worker）

为了让苹果地图和高德走同一条流程，链接统一发给 `wloc-spoofer.wloc.workers.dev/api/parse` 解析：

- **高德**：分享出来是短链，真实坐标只藏在 302 跳转的 `Location` 头里，且是 GCJ-02 偏移坐标。快捷指令既读不到跳转头、也难做坐标换算，所以由 worker 跟跳转 → 抠坐标 → GCJ-02→WGS84 → 返回经纬度。
- **苹果地图**：链接里直接带 `coordinate=纬度,经度`，但在**中国大陆同样是 GCJ-02 偏移坐标**，所以和高德一样由 worker 做 GCJ-02→WGS84 换算后返回；境外坐标会自动跳过换算（`out_of_china` 判断）原样返回。除了统一坐标系，走同一接口也方便统一处理短链、文本夹链接、名称解码等。

**隐私：** `/api/parse` 是纯转发解析——收到链接 → 跟跳转 → 解析坐标 → 返回 JSON，全程不写任何存储、不记日志、不缓存，处理完即丢（`wrangler.jsonc` 里已显式关闭 observability）。跟跳转时只接受 http/https，单次请求 8 秒超时、只读响应正文前 512 KB。

**不放心可自行部署：** worker 源码完全开源，可自己部署一份替换上面的地址：

- 路由：[`worker/src/index.js`](worker/src/index.js)
- 链接解析与坐标换算：[`worker/src/parse.js`](worker/src/parse.js)
- 选点页面：[`worker/src/page.js`](worker/src/page.js)、[`worker/src/gcj-browser.js`](worker/src/gcj-browser.js)
- 部署后把快捷指令里的 `wloc-spoofer.wloc.workers.dev` 换成你自己的 worker 域名即可。

解析逻辑带一套不联网的回归测试，改动后跑一下：

```bash
cd worker && npm install && npm test
```

**坐标系说明：** 页面内部一律以 WGS84 为准。底图切到「高德」时，瓦片画的是 GCJ-02
地物，与 Leaflet 的 WGS84 像素映射差着一个偏移量（深圳一带约 600 米），页面会在
选点/落点时自动双向换算，所以在任意底图上点选得到的都是同一个 WGS84 坐标。

各家地图的坐标系不同，换算按「来源 × 地区」分派：

| 来源 | 中国大陆 | 港澳台 |
|------|----------|--------|
| 苹果地图 / Google | GCJ-02，需换算 | **WGS84，不换算** |
| 高德 / 百度 | GCJ-02 / BD-09，需换算 | 同左，仍需换算 |

**港澳台建议优先用苹果或高德的链接。** 百度在港澳台的分享短链，坐标要靠网页脚本
带反爬令牌去查，服务端取不到；变通办法是在浏览器打开该链接，等地址栏变成
`map.baidu.com/poi/名称/@数字,数字,19z` 之后复制整条地址再粘贴——但百度的针脚位置
与苹果/高德常有几十到两百米的出入（大陆约 5 米，港澳台可达 240 米），精确定位时
不建议用它。

---

<details>
<summary><b>使用方法</b></summary>

1. 订阅模块并启用 MITM
2. 打开在线选点页面（公共 Worker，建议添加到主屏幕）
3. 地图选位置 / 搜索地名 / 粘贴地图链接
4. 点击「储存到设备」
5. 下次 Apple 定位触发时自动生效

支持 Apple Maps / Google Maps / 高德 / 百度 / 坐标文本 链接解析。

> **iOS 26/27 及更高版本注意：** Apple 从 iOS 26 开始大幅强化了 `locationd` 的定位缓存机制，系统会将之前获取的真实定位结果缓存在内存中并长时间复用。这意味着安装模块或切换目标坐标后，即使脚本已成功修改了 WLOC 响应（日志显示"已修改"），系统仍可能继续使用缓存中的旧坐标，导致定位看起来没有变化。
>
> **解决方法：重启设备。** 重启会清空 `locationd` 的内存缓存，系统重新发起 WLOC 请求时会拿到修改后的坐标。飞行模式开关、关闭定位服务等方式在 iOS 26+ 上**无法**清除此缓存，必须重启。iOS 15~18 通常不需要重启即可生效。
>
> ⚠️ **2026-11-04 起请谨慎重启：** 有用户反馈重启之后无法再拦截 `gs-loc.apple.com`（见页首更新）。重启前请知悉：如果重启后拦截失效，定位修改就不会再生效，系统会回到真实定位。

**高版本系统推荐操作流程（成功率最高）：**

方法一：
1. 先在选点页面选好需要修改的定位并储存到设备
2. 开飞行模式 → 关闭定位服务 → 重启设备
3. 关闭飞行模式（WiFi 也要关）→ 连接代理工具（确认 VPN 图标出现）→ 打开定位服务
4. 打开地图验证

方法二：
1. 关闭定位服务
2. 在选点页面选好位置并储存到设备
3. 打开定位服务 → 弹出「允许访问位置信息」时选择**「下次询问或在我共享时」**
4. 打开地图验证

</details>

<details>
<summary><b>工作原理</b></summary>

```
选点页面 → fetch gs-loc.apple.com/wloc-settings/save?lon=x&lat=y
         → 代理模块拦截 → wloc-settings.js 写入 $persistentStore
         → 下次 WLOC 触发 → wloc.js 读取坐标 → patch protobuf 响应
```

模块包含两条规则：
- `wloc.js` — 拦截 `/clls/wloc` 响应，解析 protobuf 并替换坐标
- `wloc-settings.js` — 拦截 `/wloc-settings/save` 请求，写入持久化存储

</details>

<details>
<summary><b>参数配置</b></summary>

| 参数 | 说明 | 默认值 |
|------|------|--------|
| longitude | 目标经度(在线选点优先) | null (透传) |
| latitude | 目标纬度(在线选点优先) | null (透传) |
| accuracy | 精度(米) | 25 |
| randomRadius | 扰动半径(米)，每次定位在目标点周围随机偏移，0=关闭 | 0 |
| logLevel | 日志级别 | info |

优先级: 在线选点储存 > 模块参数 > 默认值

> **扰动半径说明：** 启用后每次定位响应会在目标坐标周围指定米数内随机偏移，避免每次定位结果完全相同。Surge/Loon/Stash/Shadowrocket 可在模块参数中设置；QX 用户可通过选点页面设置。默认 0（关闭），不影响现有用户。

</details>

<details>
<summary><b>取消虚拟定位 / 恢复真实定位</b></summary>

**方法一：关闭或删除模块**（推荐）

关闭模块后脚本不再拦截 WLOC 请求，系统自动恢复真实定位。iOS 26+ 需要重启设备清除定位缓存。

**方法二：清除持久化数据（透传模式）**

清除已保存的坐标后，脚本进入**透传模式**——不修改 WLOC 响应，直接放行原始数据，系统自动恢复真实 GPS 定位。

**透传模式触发条件：** 持久化数据为空（null）且模块参数为默认值（113.94114, 22.544577）时，脚本判定用户未自定义坐标，自动跳过修改。模块默认参数无需更改，仅清除持久化数据即可触发透传。

在代理工具中删除持久化数据，字段名为 `wloc_settings`：

- **Surge** — 脚本编辑器运行: `$persistentStore.write(null, "wloc_settings")`
- **Quantumult X** — 运行: `$prefs.removeValueForKey("wloc_settings")`
- **Loon** — 运行: `$persistentStore.write(null, "wloc_settings")`

清除后重启设备即可恢复真实定位。无需关闭模块，脚本会自动检测到无自定义坐标并跳过修改。

> **注意：** 如果用户在模块参数中手动修改了经纬度（非默认 113.94114, 22.544577），即使清除持久化数据，脚本仍会使用模块参数中的坐标进行修改。只有保持默认参数不变时，清除持久化数据才会进入透传模式。

</details>

<details>
<summary><b>收藏位置功能</b></summary>

在线选点页面支持收藏多个位置，方便来回切换：

- **添加收藏**：选好位置后点击「收藏位置」→ 输入备注名称（支持中文/英文/数字，最多 30 字）→ 保存
- **快速切换**：点击收藏列表中的位置 → 地图自动跳转 → 点「储存到设备」即可切换
- **当前生效标记**：与设备已保存坐标一致的收藏会显示「✓ 当前生效」
- **删除管理**：单个删除（×按钮）或清空全部
- **当前生效坐标**：页面显示设备端持久化数据（wloc_settings），支持刷新查询和清除

**数据存储说明：**
- **收藏列表** → 保存在浏览器 `localStorage`（仅用于选点页面的 UI 便捷操作）
- **生效坐标** → 保存在代理工具持久化存储 `$persistentStore`（脚本运行时实际读取的数据）

两者独立存储。收藏列表是浏览器端的辅助数据，清除浏览器缓存或换浏览器后需重新收藏，但不影响已储存到设备的生效坐标。

</details>

<details>
<summary><b>自部署 Worker（推荐）</b></summary>

公共选点页面有请求上限，建议部署自己的实例：

- **Workers**: `https://wloc-spoofer.wloc.workers.dev/`
- **Pages**: `https://wloc-pages.pages.dev/`

**一键部署（Workers）：**

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Yu9191/wloc/tree/main/worker)

> 一键部署仅支持 Workers 模式，点击按钮后按提示授权即可完成部署。

**手动部署（Workers）：**

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

部署成功后会得到你自己的 Worker 地址（如 `https://wloc-spoofer.<你的子域名>.workers.dev`），用这个地址选点即可。

> 免费账户每天 10 万次请求，个人使用完全够用。

<details>
<summary>高级：Pages 部署</summary>

Pages 部署不支持一键按钮，需要手动执行：

```bash
git clone https://github.com/Yu9191/wloc.git
cd wloc/worker
npm install
npm run pages:deploy
```

> 必须走 `npm run pages:deploy`（它带 `-c wrangler.pages.jsonc`）。直接跑
> `wrangler pages deploy dist` 会丢掉配置里的 compatibility 设定。

部署时会提示设置 production branch，输入 `main` 即可。部署成功后得到 `https://<项目名>.pages.dev` 地址。

Pages 和 Workers 功能完全一致，按需选择即可。

</details>

</details>

<details>
<summary><b>注意事项</b></summary>

- 需要 MITM 证书信任 `gs-loc.apple.com` 和 `gs-loc-cn.apple.com`
- 2026-11-04 起，iOS 26、iOS 18 的多个版本上出现这两个域名拦截失效（提示证书无效），原因未确认，详见页首更新
- 仅修改网络定位(WiFi/基站)，不影响 GPS 硬件定位
- iOS 在 GPS 信号强时可能忽略网络定位结果
- 适用于 WiFi 定位为主的室内场景效果最佳
- 选点页面需在代理模式下使用（Safari 走代理才能拦截储存请求）

</details>

---

## 致谢

- [proxypin-wloc-spoofer](https://github.com/FFF686868/proxypin-wloc-spoofer) - 原始 WLOC 定位修改思路 by FFF686868
- [NSNanoCat/Util](https://github.com/NSNanoCat/util) - 跨平台脚本工具框架

### 贡献者

- [@YmlyZA](https://github.com/YmlyZA) - 百度地图支持、港澳台边界处理、GCJ 换算优化、回归测试覆盖 ([#83](https://github.com/Yu9191/wloc/pull/83))
- [@YeTianXingShi](https://github.com/YeTianXingShi) - randomRadius 随机坐标扰动功能原始实现 ([#70](https://github.com/Yu9191/wloc/pull/70))
- [@SajoLuo](https://github.com/SajoLuo) - Stash 响应格式修复 ([#66](https://github.com/Yu9191/wloc/pull/66))
- [@SkywardLab](https://github.com/SkywardLab) - 扩展 WLOC 备用域名拦截 ([#90](https://github.com/Yu9191/wloc/pull/90))
- [@beiming0000](https://github.com/beiming0000) - 逗号小数格式坐标丢失问题报告 ([#96](https://github.com/Yu9191/wloc/issues/96))

---

## 许可证

本项目采用 [AGPL-3.0](LICENSE) 许可证。未经授权，禁止将本项目代码用于商业产品或上架应用商店。
