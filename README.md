# EdgeButler - AI Server Management Agent 🤖

EdgeButler 是一个基于 Cloudflare Workers 和 AI 构建的智能服务器管理管家。它允许您通过 Telegram 使用自然语言，安全地监控和管理您的 Linux 服务器。

## 🚀 快速开始指南

按照以下步骤部署您自己的 EdgeButler。

### 第一步：环境准备

确保您的电脑上已经安装了 [Node.js](https://nodejs.org/)。您可以打开终端并运行以下命令来验证：
```bash
node --version
```

接下来，全局安装 Cloudflare Workers 命令行工具：
```bash
npm install -g wrangler
```
*提示：您可以运行 `wrangler --version` 来检查是否安装成功。*

登录您的 Cloudflare 账号：
```bash
wrangler login
```

### 第二步：安装依赖

在您解压此项目代码的文件夹中，安装必要的依赖包：
```bash
npm install
```

### 第三步：配置 Telegram 机器人

1. 打开 Telegram 并搜索 `@BotFather`。
2. 发送 `/newbot` 并按照提示创建一个新的机器人。
3. 创建成功后，BotFather 会提供给您一个 **API Token**（例如：`123456789:ABCDefg...`）。请妥善保管！

将这个 Token 安全地存入您的 Cloudflare 环境中：
```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
```
*（当提示输入时，粘贴您的 Telegram API Token 并按回车确认）*

### 第四步：配置您的 VPS (Linux 服务器)

您需要将管家代理脚本部署在您的 Linux 服务器（如 VPS）上。

1. 使用 SSH 工具（如 Xshell、Termius 或任意终端）登录到您的 VPS。
2. 安装 Python 及依赖管理工具：
```bash
apt update && apt install python3 python3-pip -y
pip3 install Flask
```
3. 在服务器上创建或上传 `vps_agent.py` 文件：
```bash
nano vps_agent.py
```
*（将本项目中 `vps_agent.py` 的内容复制粘贴进去。**请务必将代码中的 `YOUR_SUPER_SECRET_TOKEN` 改为您自己设置的复杂密码！**）*

4. 在后台持续运行该 API 服务：
```bash
nohup python3 vps_agent.py > agent.log 2>&1 &
```
*（敲击回车执行。您可以使用 `cat agent.log` 来查看是否启动成功且无报错。）*

### 第五步：将 VPS 绑定至 Cloudflare

回到您电脑上项目所在的终端，将您的 VPS IP 和设置的密码存入：

```bash
npx wrangler secret put VPS_IP
```
*（输入您服务器的公网 IP 地址，例如：198.51.100.1）*

```bash
npx wrangler secret put VPS_TOKEN
```
*（输入您刚才在 `vps_agent.py` 中设置的那个复杂密码）*

### 第六步：部署到 Cloudflare

运行以下命令部署您的 Worker：
```bash
npm run deploy
```
部署完成后，终端会输出您专属的 Worker 地址，看起来类似：
`https://edgebutler.<您的用户名>.workers.dev`

### 第七步：设置 Telegram Webhook

为了将 Telegram 与您的 Cloudflare Worker 连接起来，请打开您的浏览器，访问以下网址（请将尖括号内的内容替换为您实际的 Bot Token 和 Worker 地址）：

```text
https://api.telegram.org/bot<您的_TELEGRAM_BOT_TOKEN>/setWebhook?url=https://edgebutler.<您的用户名>.workers.dev/telegram
```

如果设置成功，浏览器页面会显示 `{"ok":true,"result":true,"description":"Webhook was set"}`。

### 第八步：大功告成，开始测试！ 🎉

1. 打开 Telegram，找到您刚刚创建的机器人，开始对话。
2. 尝试发送类似以下的自然语言指令：
   - "查一下内存"
   - "查一下系统负载"
   - "帮我查一下 nginx 进程"

**可选项：查看 Cloudflare 实时日志**
如果您想实时监控您的 Worker 运行状态，可以运行：
```bash
npx wrangler tail
```

---

## 🛠 支持的安全能力白名单

为了保障服务器安全，您的 EdgeButler 默认配置了严格的安全动作白名单。目前它仅允许执行以下操作：
- 内存与磁盘检查 (`check_memory`, `check_disk`)
- 系统信息与 CPU 负载 (`check_os_version`, `check_cpu`)
- 进程资源监控 (`check_top_processes`, `check_process`)
- 网络与端口状态检查 (`check_network`, `check_port`)
- Docker 容器与系统日志查看 (`check_docker`, `check_logs`)
- 重启特定服务 (`restart_service`)
