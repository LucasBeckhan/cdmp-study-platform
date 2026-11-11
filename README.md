# 🧠 LearnOS — 个人学习操作系统（多轨道认证/技能学习平台）

> 从 CDMP 备考平台演进而来：以**轨道（Track）**为核心抽象，每一门认证/技能都是一个轨道
> （CDMP / PMP / CKA / Java / Go…），共享同一套 计划 → 精讲 → 刷题 → 模考 引擎。
> 产品与技术的完整设计见 [docs/PRODUCT.md](docs/PRODUCT.md)。

[![GitHub Pages](https://img.shields.io/badge/在线访问-GitHub%20Pages-22d3ee?style=flat-square&logo=github)](https://lucasbeckhan.github.io/cdmp-study-platform/)
[![License: MIT](https://img.shields.io/badge/License-MIT-8b5cf6?style=flat-square)](LICENSE)
[![Tracks](https://img.shields.io/badge/轨道-CDMP%20·%20PMP%20·%20CKA%20·%20Java%20·%20Go-3b82f6?style=flat-square)](docs/PRODUCT.md)

---

## 🔒 隐私说明（先读这个）

- **纯静态、零后端、零埋点、零第三方请求**：页面所有资源本地加载，不向任何服务器发送数据。
- 学习进度**按轨道隔离**存于浏览器 localStorage，清除浏览器数据即重置（M2 将提供导出/导入）。
- 全部学习内容打包为**加密保险库**（AES-256-GCM，密钥由访问密码经 PBKDF2 派生）：仓库与线上只有密文。
- 资料目录与真题数据**不含任何来源信息**；全部明文数据文件不入 Git 仓库。

## 🔐 访问门禁（已启用）

首次访问需输入**访问密码**解锁；可勾选「记住此设备」免重复输入，右上角 🔒 退出 可随时重新上锁。

- 这是**真加密而非摆设**：密码错误 = 解密失败 = 内容不可读；内容明文与密码都不存在于仓库和页面中。
- **修改访问密码**：`CDMP_PASS=新密码 node tools/encrypt-data.mjs`，然后提交更新后的 `data/vault.js`。
- **安全提示**：弱密码可被离线穷举，个人小圈子使用可接受；正式对外建议 10 位以上混合密码。

## ✨ 平台能力

| 模块 | 说明 |
|---|---|
| ⌂ **轨道中心** | 全部轨道一屏总览：进度环、刷题/模考统计、建设中占位（PMP / CKA / Java / Go） |
| 🔀 **轨道切换** | 顶栏切换器秒切轨道，进度互不干扰；URL 即状态（`#/cdmp/quiz`） |
| 🔁 **学习计划** | 每轨独立的 N 天冲刺计划：逐日勾选 + 考试日期倒计时 |
| 📚 **知识体系** | 知识域卡片：核心摘要 / 高频考点 / 必背术语 / 一句话必背，标注考纲权重 |
| ✎ **章节刷题** | 按知识域 / 随机 / 错题重练 / 真题专区，全部带解析；⌨ 键盘流：A-D 作答、Enter 前进、F 标记、←/→ 翻题 |
| 🔍 **全局搜索** | Ctrl+K（⌘K）唤起：术语 / 考点 / 题干秒查，题目可预览答案与解析 |
| 🔥 **学习热力图** | 近 16 周打卡热力 + 连续学习天数，学习节奏一目了然 |
| ⚙ **数据管理** | 进度 JSON 一键导出/导入备份、重置当前轨道（防浏览器数据丢失） |
| ◎ **模拟考试** | 闭卷计时、标记回顾、评分圆环、章节诊断、成绩历史 |
| ▤ **资料纳管** | 按备考价值分级（S/A/B/C）+ 学习状态跟踪，来源信息已脱敏 |
| ✦ **备考攻略** | 考试速览、答题策略、记忆法（轨道级）+ 平台通用内容 |

## 🚀 快速开始

**本地模式（免费，单设备）**：GitHub Pages 线上地址（`main` 分支根目录），输入内容密码即用。

**云端模式（多账号 · 多设备同步 · 自托管）**：

```bash
git clone https://github.com/LucasBeckhan/cdmp-study-platform.git
cd cdmp-study-platform
LEARNOS_CONTENT_PASS=cdmp PORT=8787 npm start
# 打开 http://localhost:8787 → 门禁出现「账号登录」→ 注册即用
```

登录后：进度自动云同步（track 粒度 LWW + 错题/模考并集合并）、内容自动解锁、顶栏显示同步状态。生产部署（Docker / VPS+systemd+Caddy / Railway）见 [docs/DEPLOY.md](docs/DEPLOY.md)。

## 🗂 项目结构

```
cdmp-study-platform/
├── index.html              # 应用壳（双模式门禁 + 轨道导航）
├── css/style.css           # 深空科技风样式
├── js/
│   ├── core.js             # 纯函数域逻辑（作答/统计/错题/洞察/搜索/状态迁移，Node 可测）
│   ├── crypto.js           # 门禁加解密（PBKDF2 + AES-GCM，Node 可测）
│   ├── cloud.js            # ☁ 云模式客户端（探测/认证/进度同步/LWW 合并）
│   └── app.js              # 壳层：路由 / 视图 / 快捷键 / 门禁交互
├── server/                 # ☁ API 服务器（零依赖 Node：静态托管 + REST API）
│   ├── index.mjs           # HTTP 入口（静态 + CSP 安全头 + SPA 回退）
│   ├── api.mjs             # 认证/进度路由（scrypt 账号 + 会话 + 限流）
│   ├── auth.mjs            # 密码散列 / 会话令牌 / 输入校验
│   └── db.mjs              # 原子化 JSON 存储
├── tests/                  # 27 例测试（node --test：core + crypto + 服务器 API）
├── docs/                   # PRODUCT.md（PRD）· DEPLOY.md（部署指南）
├── tools/                  # 打包器（自动发现 + 防呆清单）· 真题解析器
├── Dockerfile / docker-compose.yml  # 容器化部署
├── .github/workflows/ci.yml         # CI：语法 / 27 测试 / 仓库卫生
└── data/
    ├── vault.js            # 🔐 加密保险库（JSON 模式，免 eval，严格 CSP 可用）
    ├── content.sha256      # 分片哈希清单（防"改数据忘重打包"）
    └── *.js                # 轨道包明文分片（仅本地，不入库）
```

**开发工作流**（维护者）：

```bash
npm test                      # 单元测试（node --test，零依赖）
CDMP_PASS=密码 npm run build  # 明文数据 → 加密保险库（自动发现分片）
npm run check                 # 校验明文与清单一致（防"改数据忘重打包"）
```

推送后 CI 自动执行：全量 JS 语法检查、单元测试、仓库卫生检查（明文数据不入库、保险库无明文标记）。

## ➕ 新增一条轨道（Java / PMP / CKA / Go）

每条轨道是一个**六件套内容包**（详见 [PRODUCT.md §5](docs/PRODUCT.md)）：
`meta`（考试信息）+ `knowledge`（知识域）+ `bank`（≥100 题带解析）+ `plan`（冲刺计划）+ `resources`（资料）+ `tips`（攻略）。

```bash
# 1. 仿照 data/track-cdmp.js 创建 data/track-java.js，注册到 window.TRACKS.java
# 2. 在 data/platform.js 的 tracksOrder 中确认顺序、从 comingSoon 移除
# 3. 重新打包保险库并提交
CDMP_PASS=访问密码 node tools/encrypt-data.mjs
git add data/vault.js && git commit -m "feat(java): 新增 Java 轨道" && git push
```

**真题导入**（当前 CDMP 轨道可用）：真题 xlsx 放入 `_import/`（不入库），运行
`python3 -I tools/parse_real_xlsx.py _import/*.xlsx -o data/cdmp-real.js`，
再重新打包保险库。

## 🧭 服务化路线图

| 级别 | 形态 | 费用 | 状态 |
|---|---|---|---|
| **L1 私有加密站点** | 静态站 + 密码门禁 + 内容加密 + 多轨道 | **0 元** | ✅ 已上线 |
| **L2 多账号 + 云同步** | Supabase：独立账号、进度跨设备漫游（本地优先 + 增量同步） | 0 元（免费档） | 等待 BaaS 账号 |
| **L3 完整在线服务** | 独立域名、管理后台（轨道 CMS）、对象存储、可选会员支付 | ¥100-500/年起 | 需基础设施决策（大陆需 ICP 备案） |

## 💰 小程序费用速览

网页版 = **0 元**。微信小程序：个人主体免费注册（刷题够用）；企业认证 ¥300/年 + 备案域名 + 服务器，首年约 ¥500-700；可用 uni-app/Taro 复用本平台代码。详细对比见平台「备考攻略」页。

## 📝 CDMP 轨道考试速览（以官方最新公告为准）

100 道单选 · 90 分钟 · 及格 60 · 机考约 ¥2500 · 证书 3 年有效 · 依据 DAMA-DMBOK2。
高权重知识域：治理 / 建模 / 质量 / 架构（各约 11%）。

## ⚖️ 声明

1. 个人学习用途的开源工具；学习资料仅供个人学习使用，请勿商用传播。
2. 各认证的题量、时长、费用以官方当期公告为准。
3. 学习记录保存在浏览器 localStorage，清除浏览器数据会重置进度。

## 📄 License

MIT
