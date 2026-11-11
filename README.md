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
| ✎ **章节刷题** | 按知识域 / 随机 / 错题重练 / 真题专区，全部带解析 |
| ◎ **模拟考试** | 闭卷计时、标记回顾、评分圆环、章节诊断、成绩历史 |
| ▤ **资料纳管** | 按备考价值分级（S/A/B/C）+ 学习状态跟踪，来源信息已脱敏 |
| ✦ **备考攻略** | 考试速览、答题策略、记忆法（轨道级）+ 平台通用内容 |

## 🚀 快速开始

**在线使用**：GitHub Pages 线上地址（`main` 分支根目录）。

**本地使用**：

```bash
git clone https://github.com/LucasBeckhan/cdmp-study-platform.git
cd cdmp-study-platform
python3 -m http.server 8080   # 浏览器打开 http://localhost:8080
```

## 🗂 项目结构

```
cdmp-study-platform/
├── index.html              # 应用壳（门禁 + 轨道导航）
├── css/style.css           # 深空科技风样式
├── js/app.js               # 多轨道引擎：路由 / 门禁解密 / 刷题模考 / 进度管理
├── docs/PRODUCT.md         # 产品设计文档（定位 / IA / 领域模型 / 路线图）
├── tools/
│   ├── parse_real_xlsx.py  # 真题 xlsx 解析器（纯标准库）
│   └── encrypt-data.mjs    # 内容加密打包器（生成 data/vault.js）
└── data/
    ├── vault.js            # 🔐 加密保险库（仓库中唯一的分发声）
    ├── platform.js         # 平台注册表：轨道清单 + 占位 + 平台级内容（明文，仅本地）
    ├── track-cdmp.js       # CDMP 轨道组装器（明文，仅本地）
    └── cdmp-*.js           # CDMP 轨道六件套分片（明文，仅本地）
```

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
