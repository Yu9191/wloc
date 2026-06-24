# WLOC 虚拟定位 - 使用说明

## 工作原理

```
用户在手机 Safari 打开选点页面
  → 地图选位置 / 搜索地名 / 粘贴地图链接
  → 点击「储存到设备」
  → 页面请求 https://gs-loc.apple.com/wloc-settings/save?lon=x&lat=y
  → 代理模块拦截请求 → wloc-settings.js 写入 $persistentStore
  → 下次 Apple 定位触发 → wloc.js 读取坐标 → 修改定位响应
```

如果模块未启用 → 请求不会被拦截 → 页面提示检查 MITM/模块配置。

---

## 使用方法

### 1. 安装模块（一次性）
订阅对应平台的模块并启用 MITM。

### 2. 打开选点页面
在 Safari 中打开公共选点页面（建议添加到主屏幕）:
```
https://你的worker域名/
```

> Worker 是纯静态页面，不存储任何数据。坐标直接写入你的设备本地。

### 3. 选择位置
- **点击地图** — 直接点选
- **搜索地名** — 输入"上海外滩"等
- **粘贴链接** — 从 Apple Maps / Google Maps / 高德 / 百度复制分享链接
- **当前位置** — 使用浏览器定位

### 4. 储存到设备
点击「� 储存到设备」→ 显示 ✓ 即成功。

---

## 部署公共选点页面

Worker 是纯静态页面服务，无需任何绑定：

```bash
cd worker
npx wrangler deploy
```

或在 CF Dashboard → Workers → 新建 Worker → 粘贴 `wloc-worker.js` → 部署。

不需要 KV、不需要数据库、不需要环境变量。

---

## 模块配置

模块包含两条脚本规则（已自动配置，用户无需操作）：

| 规则 | 类型 | 路径 | 作用 |
|------|------|------|------|
| Apple WLOC | http-response | `/clls/wloc` | 修改定位响应 |
| WLOC Settings | http-request | `/wloc-settings/save` | 接收选点页面写入 |

MITM 主机名: `gs-loc.apple.com, gs-loc-cn.apple.com`（已包含在模块中）

---

## 储存失败排查

页面显示红色提示时，检查：
1. **模块已启用** — 在代理工具中确认 WLOC 模块开关打开
2. **MITM 证书** — 已安装并信任 CA 证书
3. **MITM 主机名** — 包含 `gs-loc.apple.com`
4. **代理连接** — 当前网络走代理（Safari 请求会经过代理）

---

## 备选：手动编辑（BoxJS）

不使用选点页面时，可在 BoxJS 中直接编辑 `wloc_settings`:
```json
{"longitude":121.4737,"latitude":31.2304,"accuracy":25}
```

优先级: 已储存坐标 > 模块参数 > 默认值
