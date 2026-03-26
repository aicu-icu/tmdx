# tmdx Cloud Server (Go)

Go 重写版本的 tmdx 云端 WebSocket 中继服务器。

## 功能

- OAuth2 登录（GitHub + Google）
- JWT 认证（Cookie + Agent Token）
- WebSocket 浏览器↔Agent 中继
- SQLite 持久化存储
- Tier 分层限制（free/pro/poweruser）
- Agent 配对流程
- 安装脚本生成（bash/powershell）
- Discord Webhook 通知
- 页面分析追踪

## 依赖

| 包 | 用途 |
|---|------|
| gin-gonic/gin | HTTP 框架 |
| gorilla/websocket | WebSocket |
| golang-jwt/jwt/v5 | JWT |
| modernc.org/sqlite | SQLite (纯 Go) |
| golang.org/x/oauth2 | OAuth2 |
| google/uuid | UUID 生成 |
| joho/godotenv | .env 加载 |

## 快速开始

```bash
# 构建
make build

# 运行
make run

# 或直接
go run ./cmd/cloud/
```

## 环境变量

参考 `.env.example`。

## 项目结构

```
cloud/
├── cmd/cloud/main.go                    # 主入口
├── internal/
│   ├── config/config.go                 # 配置加载
│   ├── db/                              # SQLite 数据库层
│   ├── auth/                            # JWT、OAuth、认证中间件
│   ├── ws/                              # WebSocket 中继
│   ├── billing/                         # Tier 限制
│   ├── routes/                          # HTTP 路由
│   ├── notifications/                   # Discord 通知
│   ├── utils/                           # 工具函数
│   └── static/
│       ├── embed.go                     # go:embed 声明
│       └── public/                      # 静态前端资源
│           ├── fonts/                   # 本地字体 woff2 文件
│           ├── fonts.css                # @font-face 声明（替代 Google Fonts CDN）
│           ├── lib/
│           │   ├── monaco/vs/           # Monaco Editor（本地化）
│           │   ├── marked.min.js        # Marked.js v15
│           │   └── purify.min.js        # DOMPurify v3
│           └── *.html, *.css, *.js, ...
├── package.json                         # npm 依赖（terser, obfuscator, monaco-editor）
└── build.js                             # JS 构建脚本
```

## 离线资源说明

所有外部 CDN 资源（Google Fonts、Monaco Editor、Marked.js、DOMPurify）已下载到本地，支持完全离线运行。

### 字体

- 16 个字体家族，23 个 woff2 文件，存放在 `internal/static/public/fonts/`
- 通过 `fonts.css` 的 `@font-face` 声明替代 Google Fonts CDN
- 更新字体时，使用 [google-webfonts-helper](https://gwfh.mranftl.com/api) API 获取 woff2 URL

### Monaco Editor

- 版本：`0.52.2`，通过 npm 安装后拷贝到 `internal/static/public/lib/monaco/vs/`
- 更新 Monaco：
  ```bash
  npm install monaco-editor@<version>
  cp -r node_modules/monaco-editor/min/vs internal/static/public/lib/monaco/vs
  ```
- **部署时 `node_modules/` 可删除**，运行时只依赖 `public/lib/monaco/` 中的文件
- `package.json` 中的 `monaco-editor` 依赖仅用于下载源文件，不参与构建流程

### Marked.js / DOMPurify

- 存放在 `internal/static/public/lib/`，手动下载，无需 npm
