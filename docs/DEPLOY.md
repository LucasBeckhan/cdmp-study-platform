# LearnOS 部署指南（云端模式）

> 三种形态：**本地模式**（GitHub Pages，免费，单设备）→ **云端模式**（自托管 API，多账号 + 多设备同步）→ 后续 L3（对象存储/管理后台）。

## 1. 形态对比

| | 本地模式 | 云端模式 |
|---|---|---|
| 账号 | 无（内容密码门禁） | 邮箱注册/登录（scrypt 加盐 + HttpOnly 会话） |
| 进度 | 浏览器 localStorage | 云端 + 本地双写（track 粒度 LWW，错题/模考并集合并） |
| 内容解锁 | 内容密码 | 账号登录后自动解锁（需配置 `LEARNOS_CONTENT_PASS`） |
| 成本 | 0 元 | 服务器 ¥30-100/月（小型 VPS/Railway 免费档可跑） |

## 2. 快速启动（任意有 Node ≥ 20 的机器）

```bash
git clone https://github.com/LucasBeckhan/cdmp-study-platform.git
cd cdmp-study-platform
LEARNOS_CONTENT_PASS=cdmp PORT=8787 npm start
# 打开 http://localhost:8787 —— 顶部出现「账号登录」标签即为云端模式
```

环境变量：

| 变量 | 说明 | 默认 |
|---|---|---|
| `PORT` | 监听端口 | `8787` |
| `LEARNOS_DATA_DIR` | 服务器数据目录（users/sessions/progress） | `server-data` |
| `LEARNOS_CONTENT_PASS` | 内容自动解锁密码（= 打包时的 `CDMP_PASS`）；不设则登录后需手输内容密码 | 空 |

## 3. Docker 部署

```bash
docker compose up -d --build
# 数据持久化在 ./server-data
```

## 4. VPS + systemd + Caddy（生产推荐）

```ini
# /etc/systemd/system/learnos.service
[Unit]
Description=LearnOS
After=network.target
[Service]
WorkingDirectory=/opt/learnos
ExecStart=/usr/bin/node server/index.mjs
Environment=PORT=8787
Environment=LEARNOS_CONTENT_PASS=你的内容密码
Environment=LEARNOS_DATA_DIR=/opt/learnos/server-data
Restart=always
User=learnos
[Install]
WantedBy=multi-user.target
```

```Caddyfile
# Caddyfile —— 自动 HTTPS
learnos.example.com {
    reverse_proxy localhost:8787
}
```

> ⚠️ 生产必须走 HTTPS：会话 Cookie 为 HttpOnly+SameSite=Lax，Caddy/网关终止 TLS 后
> 建议在反代层注入 `X-Forwarded-Proto: https` 并在应用层校验（后续版本将支持 Secure 标记自动探测）。

## 5. Railway / Render 一键

- 仓库导入 → 启动命令 `node server/index.mjs` → 环境变量配置 `LEARNOS_CONTENT_PASS`
- 挂载持久卷到 `/app/server-data`（Railway Volumes / Render Disk）

## 6. 数据与备份

- `server-data/`：users.json（scrypt 散列）、sessions.json、progress.json（学员进度）——**唯一需要备份的目录**
- 内容更新流程：本地改 `data/*.js` → `npm run build` → 提交 `data/vault.js` + `data/content.sha256` → 服务器 `git pull` 重启（或 CI 自动部署）

## 7. 安全模型

1. 账号密码：scrypt(N=16384) 加盐散列，服务端只存散列
2. 会话：32 字节随机令牌，服务端只存 SHA-256，HttpOnly Cookie（JS 不可读）
3. 内容：始终以 AES-256-GCM 密文分发，解锁密钥由密码派生，仅在浏览器内存中出现
4. 传输：CSP（无 unsafe-eval）、X-Frame-Options、nosniff、auth 路由限流
5. 学习进度仅存于用户账号下，不做任何第三方共享
