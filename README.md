# Apple WLOC 定位修改

> 测试阶段。修改 Apple 网络定位(WLOC)返回的经纬度 + 精度 + **海拔**。

## 订阅地址

| 工具 | 订阅链接 |
|------|----------|
| Surge | `https://raw.githubusercontent.com/Yu9191/wloc/refs/heads/geo/modules/wloc.sgmodule` |
| Loon | `https://raw.githubusercontent.com/Yu9191/wloc/refs/heads/geo/modules/wloc.lpx` |
| Stash | `https://raw.githubusercontent.com/Yu9191/wloc/refs/heads/geo/modules/wloc.stoverride` |
| QuantumultX | `https://raw.githubusercontent.com/Yu9191/wloc/refs/heads/geo/modules/wloc.conf` |

MITM 主机名：`gs-loc.apple.com, gs-loc-cn.apple.com`

## Worker 地址

- 选点页：https://wloc-spoofer.daoyufan.workers.dev/
- 海拔查询接口：`GET /api/geo?lat=..&lon=..` → 返回 `{lat,lon,alt,name}`(地面海拔来自 open-meteo,无需 key);带 `?alt=123` 则直接回显。

## 海拔测试

1. 模块参数里填 `altitude`(单位米),或在选点页填海拔 / 勾「自动查询地面海拔」后储存到设备。
   - 留空 = 不改海拔(透传真实值);`0` = 海平面。
2. 触发一次定位,在系统/快捷指令里查看海拔是否变成设定值。
3. 写入规则:`field5 = 海拔(米) × 10000`(由脚本里的 `ALTITUDE_SCALE` 控制)。若真机显示的海拔与设定值有固定倍数偏差,改这个常量即可。

> 持久化存储键名为 `wloc_settings_v2`(与旧版隔离,首次需重新选点储存一次)。
