# pob-price — POB 查价工具

从 POB Code / pobb.in 链接 / .build 文件解析 Path of Exile 构建（装备、药剂、技能宝石、天赋珠宝），
通过官方市集 API 批量查询"类似装备"价格并汇总估值（国际服优先，国服适配规划中）。

## 环境要求

- Node.js ≥ 22.6（使用内置类型剥离运行 TypeScript，无运行时依赖）

## 安装

```bash
npm install
```

## 用法

```bash
# 解析构建（装备/珠宝/宝石/天赋清单）
npm run dev -- parse <input> [--json] [--raw] [--items]

# 单件查价（国际服）
npm run dev -- price <input> --item <id|序号|名称片段> [选项]
npm run dev -- price --item-text "<物品文本>" [选项]

# 例：查 POB 构建里 Inpulsa's Broken Heart 的价格
npm run dev -- price https://pobb.in/eQVFNoqVZrza --item Inpulsa --limit 5
```

<input> 支持：POB Code 字符串 / pobb.in 链接 / 本地 .code/.xml/.build 文件。

price 选项：
- `--item <id|序号|名称>` 构建有多件装备时指定（如 `--item 2` 或 `--item "Watcher's Eye"`）
- `--item-text "<物品文本>"` 直接给物品文本查价（游戏内 Ctrl+C / POB 导出格式均可）
- `--league <联赛>` 默认自动选择当前挑战联赛
- `--mode loose|strict` 词缀匹配宽松度（默认 loose；strict 额外包含隐性词缀）
- `--limit <n>` 取前 n 个挂牌（默认 5）
- `--delay <ms>` 调用间最小间隔（默认 2000ms，官方限流约 1 req/s，2s 更安全）
- `--rate-wait <ms>` 429 限流累计等待上限（默认 30000ms，超限快速失败并提示；批量可调大自动等待）
- `--json` JSON 输出；`--no-cache` 禁用磁盘缓存
- `--crafted` 按文本匹配工艺词缀（默认不查：市集上大多没有同样的工艺）
- 武器 / 身体装备查询自动带上孔数过滤（`sockets`）；6 连时额外要求 `links`（六连对价格影响极大）
- 国际服固定只查有标价（`sale_type=priced`，可立即购买）的挂牌；国服查全部（国服后端不支持该过滤，会静默返回 0）

## 可视化界面（Web UI）

在保留 CLI 的同时，提供了一个本地网页界面：

```bash
npm run dev -- serve [--port 8899]
# 浏览器打开 http://127.0.0.1:8899
```

功能：
- 粘贴 POB Code / 链接（或读取本地 .build/.xml/.code 文件）→ **解析**出装备/珠宝/宝石列表
- 勾选装备（或不勾选=全部）→ **查价** → 国际服 + 国服**双列表**展示价格（最低/中位/均价/样本/匹配数/市集链接）
- 实时进度条 + 逐项出价；每个服独立联赛选择；国服需填入登录 Cookie
- 点击装备行 **详情** 展开词缀（隐性/显性/工艺/裂痕/合成/附魔），自动翻译为中文（英文小字对照；基于国服官方客户端词缀描述表，覆盖 4.4 万余条模式）
- 纯本地服务（只监听 127.0.0.1），Cookie 只存在于浏览器输入框与本次请求，不落盘
## 测试

```bash
npm test        # 50 个用例（node:test），基于 3 个真实 POB 构建 fixture，无需网络
npm run build   # tsc 编译到 dist/（可 node dist/cli.js 使用，兼容 Node 18+）
```

## 本地测试指南

环境要求：**Node.js ≥ 22.6**（`node -v` 确认；类型剥离运行 TS 需要）。

### 1. 安装依赖

```bash
npm install
```

### 2. 单元测试（无需网络）

```bash
npm test        # 预期 50/50 通过
npm run typecheck
```

### 3. 解析测试（无需网络）

```bash
npm run dev -- parse tests/fixtures/real-pobb.in.xml      # 26 件装备 + 23 宝石 + 131 天赋节点
npm run dev -- parse tests/fixtures/import_code.code      # .code 文件（解码）
npm run dev -- parse tests/fixtures/real-pobb.in.xml --json  # 结构化 JSON
npm run dev -- parse https://pobb.in/eQVFNoqVZrza         # 在线链接（需网络）
```

### 4. 单件查价（需网络，可访问 pathofexile.com）

```bash
npm run dev -- price tests/fixtures/import_code.xml --item Inpulsa --limit 5
npm run dev -- price https://pobb.in/eQVFNoqVZrza --item "Watcher's Eye"
npm run dev -- price --item-text "<游戏内 Ctrl+C 的物品文本>"
```

首次运行会下载词缀表（data/stats，约 1MB，缓存 1 小时）。默认联赛自动选当前赛季，可 `--league` 覆盖。

### 5. 国服查价（需登录 Cookie）

国服市集（poe.game.qq.com）**需要登录会话**（QQ 账号）。用法：

```bash
# 准备（一次）：
#   1. 浏览器登录 https://poe.game.qq.com/trade（能正常搜索）
#   2. F12 → Network → 任意请求 → 复制请求头 Cookie（含 POESESSID=...），存到文件（如 cn.cookie.txt）
#      （也可用 --cookie "..." 直接传，但 Cookie 很长且含分号，--cookie-file 更稳）

npm run dev -- price tests/fixtures/import_code.xml --item Inpulsa \
  --server cn --cookie-file cn.cookie.txt --limit 5
npm run dev -- batch https://pobb.in/eQVFNoqVZrza \
  --server cn --cookie-file cn.cookie.txt --limit 3
```

**国服两个特殊要求**（踩坑总结）：
- **status 必须用 any**：`status=online` 会被国服后端静默返回 0（工具已自动处理）
- **不要传 sale_type**：显式传 sale_type 也会返回 0（工具已自动处理）

其他：
- 名称自动中英翻译（基底/唯一装/宝石，内置 4728 条对照，来源 poedb/Awakened CN）
- 词缀 stat id 跨服通用，匹配仍走国际服英文词缀表
- 联赛自动选国服当前赛季（如 S30赛季），可 `--league` 覆盖
- `--cookie` 与 `--cookie-file` 二选一；Cookie 过期时重新登录国服市集页并复制最新值
- `--refresh-token`/`--dpop-token` 为可选（一般不需要）
### 6. 整构建批量查价（需网络）

```bash
npm run dev -- batch tests/fixtures/real-pobb.in.xml --limit 3 --csv 结果.csv
```