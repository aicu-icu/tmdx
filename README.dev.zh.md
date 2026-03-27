[English](README.dev.md) | 中文

# TmdX 开发指南

## 环境要求

| 组件 | 版本 |
|------|------|
| Go | 1.21+ |
| Node.js | 18+ (仅 cloud 前端构建) |
| tmux | 3.0+ |

## 克隆项目

```bash
git clone https://github.com/aicu-icu/tmdx.git
cd tmdx
```

## 开发模式

### Agent

```bash
cd agent

make build    # 编译
make run      # 运行
make test     # 测试
make lint     # 代码检查
```

### Cloud

```bash
cd cloud

npm install   # 安装前端依赖
npm run build # 编译前端
make build    # 编译后端
make run      # 运行
go test ./... # 测试
```

## 生产构建

```bash
./build.sh

# 输出目录: dist/v<VERSION>/
# - tmd-cloud-linux-amd64
# - tmd-agent-linux-amd64
# - tmd-agent-linux-arm64
# - tmd-agent-darwin-amd64
# - tmd-agent-darwin-arm64
```

## 版本号规则

版本号存储在 `VERSION` 文件，使用日期格式：

```
0.3.26     # 2026年3月26日发布
0.3.26.1   # 同日第二次更新
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
├── AGENTS.md         # 开发规范
│
├── agent/            # 本地代理
│   ├── cmd/tmd-agent/main.go
│   └── internal/
│       ├── config/   # 配置管理
│       ├── auth/     # Token 处理
│       ├── relay/    # WebSocket 客户端
│       ├── terminal/ # 终端/tmux 管理
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
│       └── static/   # 嵌入式前端
│
└── dist/             # 构建输出
```

## 前端资源

Cloud 前端资源完全本地化，支持离线运行：

- **字体**: `cloud/internal/static/public/fonts/`
- **Monaco Editor**: `cloud/internal/static/public/lib/monaco/`
- **Marked.js**: Markdown 解析
- **DOMPurify**: XSS 防护

```bash
cd cloud
npm install monaco-editor@latest
cp -r node_modules/monaco-editor/min/vs internal/static/public/lib/monaco/vs
npm run build
```

## 环境变量 (Cloud)

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `HOST` | `0.0.0.0` | 监听地址 |
| `PORT` | `1071` | 监听端口 |
| `DB_PATH` | `data/tmdx.db` | SQLite 数据库路径 |
| `JWT_SECRET` | (随机) | JWT 签名密钥 |

## 代码规范

详见 [AGENTS.md](AGENTS.md)
