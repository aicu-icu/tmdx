[English](README.md) | 中文

# TmdX

**Remote terminals, file editor & git graph — one canvas for all your machines.**

![TmdX Screenshot](screenshot.png)

TmdX 是一个现代化的终端管理平台，让你可以通过浏览器远程管理和监控本地终端会话。无论是在家中、办公室还是旅途中，都能无缝访问你的开发环境。

## 架构

```
┌─────────────┐      WebSocket       ┌─────────────┐
│   Browser   │ ◄──────────────────► │ TmdX Cloud  │
└─────────────┘                      └──────┬──────┘
                                            │ WebSocket
                                     ┌──────▼──────┐
                                     │ TmdX Agent  │
                                     └──────┬──────┘
                                            │
                                     ┌──────▼──────┐
                                     │   tmux/PTY  │
                                     └─────────────┘
```

**组件说明**:
- **agent** - 本地代理程序，管理终端会话并连接云端
- **cloud** - 云端中继服务器，提供 Web UI 和 WebSocket 中继

## 功能特性

### 终端管理
- 基于 tmux 的持久化终端会话
- 实时终端输入/输出同步
- 多终端分屏布局保存与恢复
- 终端会话自动发现

### 文件操作
- 文件浏览器（浏览、创建、删除、重命名）
- 文件编辑器（Monaco Editor，支持语法高亮）
- 工作目录权限控制

### Git 集成
- 仓库扫描与状态显示
- Git Graph 可视化

### 系统监控
- CPU、内存、GPU 实时指标
- Claude 状态检测（idle/working/permission 等）

### 云端功能
- 本地账号密码验证
- 多账号注册登录管理
- 首个注册用户自动成为管理员
- JWT 认证
- Agent 配对流程
- Tier 分层限制（free/pro/poweruser）
- 完全离线运行（无外部 CDN 依赖）

## 优势

| 特性 | 说明 |
|------|------|
| 🚀 低延迟 | WebSocket 直连，终端响应即时 |
| 🔒 安全 | Token 认证 + HTTPS 加密传输 |
| 💾 持久化 | tmux 会话断开后自动恢复 |
| 📱 跨平台 | 浏览器访问，支持任意设备 |
| 🔌 离线可用 | 前端资源全部本地化，无需外网 |
| ⚡ 轻量 | 纯 Go 实现，单二进制部署 |
| 👥 多用户 | 支持多账号管理，首个用户为管理员 |

---

# 用户指南

## 安装 Agent

### 下载

从 GitHub Releases 下载对应平台的二进制文件：

```bash
# Linux (amd64)
curl -fsSL https://github.com/aicu-icu/tmdx/releases/latest/download/tmd-agent-linux-amd64 -o tmd-agent

# macOS (arm64)
curl -fsSL https://github.com/aicu-icu/tmdx/releases/latest/download/tmd-agent-darwin-arm64 -o tmd-agent

# 添加执行权限
chmod +x tmd-agent

# 移动到 PATH
sudo mv tmd-agent /usr/local/bin/
```

或直接访问 [Releases 页面](https://github.com/aicu-icu/tmdx/releases/latest) 下载。

## 配置与启动

```bash
# 配置云端地址和 Token
tmd-agent config ws://cloud.example.com:1071@your-token

# 前台启动
tmd-agent start

# 后台启动
tmd-agent start --daemon

# 查看状态
tmd-agent status

# 停止
tmd-agent stop
```

## 配对流程

1. 在 Web UI 点击「添加 Agent」
2. 复制生成的配对码
3. 在本地运行 `tmd-agent connect ws://cloud:1071@<pairing-code>`
4. 确认配对后即可远程访问

## 系统服务

```bash
# 查看服务安装说明
tmd-agent install-service

# Linux (systemd)
mkdir -p ~/.config/systemd/user
# ... 按提示操作

# macOS (launchd)
# ... 按提示操作
```

---

# 开发者指南

## 环境要求

| 组件 | 版本 |
|------|------|
| Go | 1.21+ |
| Node.js | 18+ (仅 cloud 前端构建) |
| tmux | 3.0+ |
| SQLite | - (使用 modernc.org/sqlite 纯 Go 实现) |

## 克隆项目

```bash
git clone https://github.com/aicu-icu/tmdx.git
cd tmdx
```

## 开发模式

### Agent

```bash
cd agent

# 安装依赖
go mod download

# 编译
make build

# 运行
make run

# 测试
make test

# 代码检查
make lint
make vet
```

### Cloud

```bash
cd cloud

# 安装依赖
go mod download
npm install

# 编译前端资源
npm run build

# 编译后端
make build

# 运行
make run

# 测试
go test ./...
```

## 生产构建

```bash
# 根目录执行，构建所有组件
./build.sh

# 输出目录: dist/v<VERSION>/
# - tmd-cloud              # 云端服务器
# - tmd-agent-linux-amd64  # Linux Agent
# - tmd-agent-darwin-arm64 # macOS Agent
```

## 版本号规则

版本号存储在 `VERSION` 文件，使用日期格式：

```
0.3.26      # 2026年3月26日发布
0.3.26.1    # 同日第二次更新
```

更新版本：

```bash
echo "0.3.27" > VERSION
```

## 项目结构

```
tmdx/
├── VERSION           # 版本号
├── build.sh          # 生产构建脚本
├── update-ver.sh     # 版本更新辅助脚本
├── AGENTS.md         # 开发规范文档
│
├── agent/            # 本地代理
│   ├── cmd/tmd-agent/main.go
│   └── internal/
│       ├── config/   # 配置管理
│       ├── auth/     # Token 处理
│       ├── relay/    # WebSocket 客户端
│       ├── terminal/ # 终端/tmux 管理
│       ├── router/   # 消息路由
│       └── sanitize/ # 输入验证
│
├── cloud/            # 云端服务器
│   ├── cmd/cloud/main.go
│   └── internal/
│       ├── config/   # 配置加载
│       ├── db/       # SQLite 数据库
│       ├── auth/     # JWT 认证
│       ├── ws/       # WebSocket 中继
│       ├── routes/   # HTTP API
│       ├── billing/  # Tier 限制
│       └── static/   # 嵌入式前端资源
│
└── dist/             # 构建输出
```

## 前端资源说明

Cloud 模块的前端资源完全本地化，支持离线运行：

- **字体**: 16 个字体家族，存放在 `cloud/internal/static/public/fonts/`
- **Monaco Editor**: 代码编辑器，存放在 `cloud/internal/static/public/lib/monaco/`
- **Marked.js**: Markdown 解析
- **DOMPurify**: XSS 防护

```bash
# 更新前端依赖
cd cloud
npm install monaco-editor@latest
cp -r node_modules/monaco-editor/min/vs internal/static/public/lib/monaco/vs
npm run build
```

## 环境变量 (Cloud)

参考 `cloud/.env.example`：

| 变量 | 说明 |
|------|------|
| `HOST` | 监听地址，默认 `0.0.0.0` |
| `PORT` | 监听端口，默认 `1071` |
| `DB_PATH` | SQLite 数据库路径 |
| `JWT_SECRET` | JWT 签名密钥 |

---

## 技术栈

### Agent
- Go 1.21
- gorilla/websocket
- creack/pty
- google/uuid

### Cloud
- Go 1.21
- gin-gonic/gin
- golang-jwt/jwt
- modernc.org/sqlite
- gorilla/websocket

### Frontend
- 原生 JavaScript (无框架)
- Monaco Editor
- Marked.js + DOMPurify

---

## 致谢

本项目参考 [49Agents](https://github.com/49Agents/49Agents) 重构而来，感谢原项目的开源贡献。

## License

MIT License
