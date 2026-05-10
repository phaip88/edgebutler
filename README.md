# EdgeButler

EdgeButler 是一个运行在 Cloudflare Workers 上的 AI VPS 运维平台。它通过网页端、Telegram 和 Linux agent，把自然语言运维请求转换成可执行的 Linux shell 命令，并支持多台 VPS 的统一管理。

当前项目重点是“agent 主动轮询 Worker”的架构：VPS 不需要开放公网入站端口，agent 只需要能访问 Cloudflare Worker 即可。

## 功能特性

- 多 VPS 管理：支持自定义名称、用户名、属地/IP 信息区分服务器。
- 一次性安装 token：网页端生成新增 VPS 的一键安装命令。
- Agent 主动轮询：VPS agent 通过 HTTPS 主动拉取任务并回传结果。
- AI Shell 运维执行器：内部运维请求默认由 AI 生成 shell 命令执行，减少固定动作限制。
- 自动纠错：shell 命令失败后会把 stdout/stderr 交给 AI 尝试修复命令并重试一次。
- 安全确认：删除、移除、清空等破坏性命令会进入 yes/no 二次确认。
- 外部项目部署：对 GitHub 项目部署保留专门部署流程，`ttyd` 有内置部署路径。
- 网页运维控制台：登录鉴权、服务器列表、按需刷新、AI 对话、通知渠道、操作日志。
- Telegram 运维入口：支持 Telegram webhook 接收指令并回复执行结果。
- 通知渠道：支持 Telegram、企业微信 Webhook、通用 Webhook。
- Cloudflare 原生：使用 Workers、Agents、Durable Objects、Workers AI 和静态资源托管。

## 架构

```text
Web Console / Telegram
  -> Cloudflare Worker API
  -> EdgeButler Durable Object Agent
  -> Workers AI 规划 shell / 总结结果
  -> VPS Agent 主动轮询任务
  -> Linux shell 执行
  -> 输出结果回传 Worker
```

### 为什么采用 agent 主动轮询

- 不要求 VPS 暴露管理端口。
- 更适合 NAT、轻量容器、云主机防火墙严格的环境。
- Worker 只负责下发任务和接收结果，网络模型更简单。
- 页面关闭后不会持续实时监控，只有点击刷新或发送指令时才产生任务。

## Cloudflare 一键部署

本仓库支持 Cloudflare Workers 的 Deploy Button。一键部署需要你拥有 Cloudflare 账号，并在部署过程中授权 Cloudflare 访问你的 GitHub 仓库。

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/phaip88/edgebutler)

一键部署会自动：

- Fork/复制项目到你的 GitHub。
- 安装依赖并构建 Worker。
- 创建 Workers AI 绑定。
- 创建 Durable Object 绑定和迁移。
- 部署 Worker 和前端静态资源。

部署完成后，建议立即设置后台登录密码：

```bash
npx wrangler secret put ADMIN_PASSWORD
```

如果你使用 Telegram，还需要设置：

```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
```

> 注意：一键部署默认使用 `workers.dev` 域名。后续可以在 Cloudflare Dashboard 中绑定自定义域名。

## 手动部署

### 环境要求

- Node.js 20+
- npm
- Cloudflare 账号
- Wrangler 登录或 `CLOUDFLARE_API_TOKEN`
- Workers AI 权限

### 克隆项目

```bash
git clone https://github.com/phaip88/edgebutler.git
cd edgebutler
npm install
```

### 登录 Cloudflare

```bash
npx wrangler login
```

如果使用 API Token：

```bash
export CLOUDFLARE_API_TOKEN="your-token"
export CLOUDFLARE_ACCOUNT_ID="your-account-id"
```

Windows PowerShell：

```powershell
$env:CLOUDFLARE_API_TOKEN = "your-token"
$env:CLOUDFLARE_ACCOUNT_ID = "your-account-id"
```

### 设置后台登录密码

```bash
npx wrangler secret put ADMIN_PASSWORD
```

也可以使用 `ADMIN_TOKEN`：

```bash
npx wrangler secret put ADMIN_TOKEN
```

`ADMIN_PASSWORD` 或 `ADMIN_TOKEN` 用于保护网页端 API。生产环境必须设置。

### 部署

```bash
npm run deploy
```

部署成功后，Wrangler 会输出 Worker 访问地址，例如：

```text
https://edgebutler.<your-subdomain>.workers.dev
```

### 自定义域名

可以在 Cloudflare Dashboard 中为 Worker 添加自定义域名。绑定后，网页端、agent endpoint、Telegram webhook 都可以使用自定义域名。

如果已经安装过 VPS agent，需要在网页端执行“更新所有在线 VPS endpoint”，或者重新执行安装命令，使 agent 的 `EDGEBUTLER_ENDPOINT` 指向新域名。

## 本地开发

```bash
npm install
npm run check
npx vite build
npx wrangler dev
```

修改 Cloudflare 绑定后生成类型：

```bash
npm run types
```

常用检查：

```bash
npm run check
```

## 添加 VPS 客户端

1. 打开 EdgeButler 网页端。
2. 登录后台。
3. 在服务器管理区域填写可选的名称、用户名、位置。
4. 生成一次性安装命令。
5. 在 VPS 上以 root 或 sudo 执行安装命令。

生成的命令类似：

```bash
curl -fsSL 'https://<worker-host>/install.sh?token=<install-token>' | sudo bash
```

URL 使用单引号是为了避免 zsh 把 `?token=` 当成 glob 通配符。

安装脚本会：

- 安装 Python、venv、curl 等依赖。
- 写入 `/opt/edgebutler/agent.py`。
- 写入 `/opt/edgebutler/config.env`。
- 注册 VPS 并获取每台 VPS 独立 agent token。
- 优先使用 systemd 自启动。
- systemd 不可用时回退到 supervisord 或 init.d。

常见文件位置：

```text
/opt/edgebutler/agent.py
/opt/edgebutler/config.env
/opt/edgebutler/run-agent.sh
/opt/edgebutler/agent.log
/opt/edgebutler/agent.err
```

## AI 运维使用说明

### 会话命令

```text
/new zo      清空上下文，并把当前会话绑定到 zo
/new         清空上下文，并清除当前 VPS
/zo          切换当前 VPS 到 zo
/mode        查看当前模式和 active VPS
/exec        执行模式，AI 可以执行命令
/chat        对话模式，只回答，不执行
/h           查看帮助
```

### 示例指令

```text
有哪些进程？
查询系统文件中是否有 ttyd
检查端口 22 是否监听
当前系统是什么发行版，列出可用的包管理器
分析 nginx 进程的资源占用
停止 ttyd 的运行
在用户目录创建一个 hes 文件夹
部署 https://github.com/tsl0922/ttyd
```

### 执行逻辑

EdgeButler 当前采用“通用 AI Shell 运维执行器”：

- 内部系统运维请求优先生成 shell 命令。
- 外部 GitHub 项目部署使用部署流程。
- 查询类命令默认只读。
- 删除/移除/清空类命令必须二次确认。
- 命令失败时，AI 会根据错误自动修复并重试一次。
- 最终返回执行命令、输出摘要、错误信息。

## Telegram 配置

### 方式一：网页端配置

1. 打开通知设置。
2. 新增 Telegram 通道。
3. 填写 Bot Token 和 Chat ID。
4. 保存后系统会生成 webhook 地址并尝试设置 webhook。
5. 点击测试确认 Telegram 能收到消息。

### 方式二：手动设置 webhook

Webhook 标准格式：

```text
https://<worker-host>/telegram/<channel-id>
```

如果使用默认入口：

```text
https://<worker-host>/telegram
```

手动设置示例：

```text
https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=https://<worker-host>/telegram
```

## 安全说明

- 每台 VPS 注册后拥有独立 agent token。
- 安装 token 是一次性的，并带过期时间。
- 网页端 API 支持 `ADMIN_PASSWORD` 或 `ADMIN_TOKEN` 登录鉴权。
- 删除、移除、清空等破坏性操作需要二次确认。
- agent 采用主动轮询，默认不暴露公网管理端口。
- 生产环境建议绑定自定义域名并启用 Cloudflare 访问控制策略。

## 常见问题

### VPS 显示离线但机器还在运行

EdgeButler 根据 agent 最近心跳判断在线状态。如果 agent 没有在心跳窗口内轮询 Worker，就会显示离线。请检查：

```bash
ps aux | grep /opt/edgebutler/agent.py
cat /opt/edgebutler/config.env
tail -n 100 /opt/edgebutler/agent.log
tail -n 100 /opt/edgebutler/agent.err
```

### zsh 执行安装命令提示 no matches found

请确认安装命令中的 URL 使用单引号：

```bash
curl -fsSL 'https://<worker-host>/install.sh?token=<install-token>' | sudo bash
```

### 设置自定义域名后 agent 离线

agent 配置中的 `EDGEBUTLER_ENDPOINT` 仍可能指向旧域名。可以：

- 在网页端执行批量 endpoint 更新。
- 或重新执行安装命令覆盖安装。
- 或手动修改 `/opt/edgebutler/config.env` 后重启 agent。

### workers.dev 域名不可用

请确认 `wrangler.jsonc` 中 `workers_dev` 为 `true`，或者已经在 Cloudflare Dashboard 绑定自定义域名。

## 项目状态

EdgeButler 仍处于快速迭代阶段，当前重点是：

- 完善通用 AI Shell 执行器。
- 增强项目部署闭环。
- 增加更多通知渠道。
- 强化审计、权限和密钥保护。
- 将状态持久化从 Durable Object 内存状态扩展到 D1/R2 等存储。

## License

MIT
