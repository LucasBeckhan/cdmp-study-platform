# 🍎 iPhone / iOS 适配与安装指南

LearnOS 提供两条 iOS 路径，按需选择（可共存）。

---

## 路线 A：PWA「添加到主屏幕」（推荐，0 成本，已完成平台侧适配）

平台已完成全部 iOS 适配：apple-touch-icon（180×180 PNG）、黑透状态栏、
`viewport-fit=cover` + 刘海/灵动岛/小圆条安全区（safe-area-inset）、
`100dvh` 动态视口、输入框 16px 防聚焦缩放、Service Worker 离线缓存。

**安装步骤（iPhone）**：

1. Safari 打开 `https://lucasbeckhan.github.io/cdmp-study-platform/`
2. 输入内容密码 `cdmp` 解锁
3. 点底部工具栏的「分享」⬆️ → 向下滑找到 **「添加到主屏幕」**
4. 点「添加」→ 桌面出现 LearnOS 图标，点开即为全屏无地址栏的 App 体验

**说明**：
- 需要 iOS 16.4+ 才支持离线 Service Worker；添加到主屏幕后首次打开会缓存全部内容
- 主屏版进度存本机；与电脑进度互通需要云端模式（见 docs/DEPLOY.md 自托管）

---

## 路线 B：原生壳 App（Xcode 侧载到自己的 iPhone，0 成本）

仓库内 `ios/` 目录是一个**完整的 XcodeGen 工程**：SwiftUI + WKWebView 全屏壳，
带深色背景与进度条行为，指向线上平台（可改成自托管地址）。

### 步骤

```bash
# 1. 安装 XcodeGen（一次性）
brew install xcodegen

# 2. 生成 Xcode 工程
cd ios && xcodegen generate
# 产出 LearnOS.xcodeproj

# 3. 打开并运行
open LearnOS.xcodeproj
```

4. Xcode 中：选中 LearnOS target → **Signing & Capabilities** → 勾选
   「Automatically manage signing」→ Team 选择你的 Apple ID（免费账号即可）
5. iPhone 用数据线连接 Mac → 顶部设备选择你的 iPhone → ▶ 运行
6. 首次侧载需要在 iPhone：设置 → 通用 → VPN与设备管理 → 信任你的开发者证书

**限制**：免费 Apple ID 的签名 **7 天过期**，过期后重新 ▶ 运行一次即可续签；
付费开发者账号（¥688/年）可解除该限制并支持 TestFlight/App Store 分发。

### 指向自托管服务

编辑 `ios/LearnOS/ContentView.swift` 中的 `url` 常量，换成你的域名即可。

---

## 路线 C：App Store 上架（对外分发，需要决策）

- Apple Developer Program **¥688/年**
- 需要：隐私政策页、账号删除入口（平台已有导出/重置，需补一个删除账号 API）、
  苹果审核（教育工具类通常顺畅，1-3 天）
- WKWebView 壳类 App 过审风险：苹果 4.2 最低功能要求——建议届时把闪卡/刷题
  做成本地优先的原生体验（现有架构支持，core.js 可编译进 iOS 经 JavaScriptCore）

**结论**：个人使用选 A 或 B；只有准备对外运营时才投入 C。
