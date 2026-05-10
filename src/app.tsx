import { useEffect, useMemo, useState } from "react";
import {
  TerminalWindow,
  SelectionPlus,
  BellRinging,
  FileMagnifyingGlass,
  HardDrives,
  SignOut,
  Translate,
  Clock,
  CheckCircle,
  WarningCircle,
  Monitor,
  RocketLaunch,
  IdentificationCard,
  MapPin,
  Trash
} from "@phosphor-icons/react";

type ServerSnapshot = {
  hostname?: string;
  os?: string;
  uptime?: string;
  load?: string;
  memory?: string;
  disk?: string;
  collectedAt: string;
};

type ManagedServer = {
  id: string;
  name: string;
  customName?: string;
  username: string;
  host: string;
  agentUrl: string;
  location: string;
  tags: string[];
  status: "pending" | "online" | "offline" | "unknown";
  lastSeenAt?: string;
  lastSnapshot?: ServerSnapshot;
  createdAt: string;
  updatedAt: string;
};

type OperationLog = {
  id: string;
  serverId?: string;
  source: "web" | "telegram" | "agent" | "system";
  action: string;
  target?: string;
  command?: string;
  output?: string;
  createdAt: string;
};

type PendingOperation = {
  id: string;
  serverId: string;
  serverName: string;
  source: "web" | "telegram";
  action: string;
  target?: string;
  command?: string;
  createdAt: string;
  expiresAt: string;
};

type NotificationChannel = {
  id: string;
  name: string;
  type: "generic_webhook" | "wecom" | "telegram";
  url?: string;
  botToken?: string;
  chatId?: string;
  telegramWebhookUrl?: string;
  telegramWebhookStatus?: string;
  telegramWebhookUpdatedAt?: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

type InstallTokenResponse = {
  token: string;
  serverId: string;
  expiresAt: string;
  installCommand: string;
};

type AuthStatus = {
  authenticated: boolean;
  authConfigured: boolean;
};

type RulesResponse = {
  rules: string;
};

type Language = "zh" | "en";

const text = {
  en: {
    loginTitle: "Admin Login",
    loginLead:
      "Enter the admin password or token configured in Cloudflare secrets.",
    noSecret:
      "No admin secret is configured. Set ADMIN_PASSWORD or ADMIN_TOKEN before production deployment.",
    credential: "Admin credential",
    signIn: "Sign in",
    signOut: "Sign out",
    title: "EdgeButler Operations",
    lead: "A professional AI-assisted console for multi-VPS operations, controlled refresh, approvals, and notifications.",
    totalVps: "Total VPS",
    online: "Online",
    pending: "Pending",
    notifications: "Notifications",
    fleet: "VPS Fleet",
    fleetHelp:
      "Status is pulled on demand. No continuous monitoring runs after closing the page.",
    reload: "Reload",
    refreshAll: "Refresh all VPS",
    refreshOne: "Refresh this VPS",
    agentEndpoint: "Agent endpoint",
    updateAgentEndpoint: "Update all agents",
    endpointUpdateQueued:
      "Endpoint update is queued. Confirm it before execution.",
    edit: "Edit",
    delete: "Delete",
    noVps:
      "No VPS registered yet. Generate an install command and run it on a test VPS.",
    addVps: "Add VPS",
    addVpsHelp: "Generate a one-time install command for a new agent.",
    customName: "Custom name",
    username: "Username",
    location: "Location",
    generateInstall: "Generate install command",
    expires: "Expires",
    aiOps: "AI Operations",
    aiOpsHelp:
      "Ask for diagnostics or operations. All commands execute directly; delete/remove commands require yes/no confirmation.",
    aiRules: "AI System Rules",
    aiRulesHelp:
      "These rules are injected into the AI planning prompt for every web and Telegram command.",
    saveRules: "Save rules",
    rulesSaved: "AI system rules saved.",
    runAi: "Run AI command",
    pendingTitle: "Pending Confirmations",
    pendingHelp: "Delete/remove confirmations expire after 10 minutes.",
    confirm: "Yes, execute",
    cancel: "No, cancel",
    notificationTitle: "Notification Channels",
    notificationHelp:
      "Configure Telegram, Enterprise WeChat, or generic webhooks.",
    name: "Name",
    type: "Type",
    webhookUrl: "Webhook URL",
    botToken: "Telegram bot token",
    chatId: "Telegram chat ID",
    saveChannel: "Save channel",
    saveAndTest: "Save and test",
    test: "Test",
    editChannel: "Edit",
    channelSaved: "Notification channel saved.",
    channelTested: "Notification test sent.",
    audit: "Operation Audit",
    auditHelp: "Recent web, Telegram, agent, and system actions.",
    noOps: "No operations yet.",
    noSnapshot: "No realtime snapshot yet.",
    lastSeen: "Last seen",
    serverNamePrompt: "Server name",
    locationPrompt: "Location",
    deleteConfirm: "Delete this VPS from EdgeButler?"
  },
  zh: {
    loginTitle: "管理员登录",
    loginLead: "输入 Cloudflare Secret 中配置的管理员密码或令牌。",
    noSecret:
      "尚未配置管理员密钥。生产部署前请设置 ADMIN_PASSWORD 或 ADMIN_TOKEN。",
    credential: "管理员凭据",
    signIn: "登录",
    signOut: "退出",
    title: "EdgeButler 运维平台",
    lead: "面向多 VPS 的 AI 运维控制台，支持按需刷新、二次确认、审计和多渠道通知。",
    totalVps: "VPS 总数",
    online: "在线",
    pending: "待确认",
    notifications: "通知渠道",
    fleet: "VPS 集群",
    fleetHelp: "状态按需拉取。关闭页面后不会继续实时监控。",
    reload: "重新加载",
    refreshAll: "刷新全部 VPS",
    refreshOne: "刷新此 VPS",
    agentEndpoint: "Agent endpoint",
    updateAgentEndpoint: "更新全部 Agent",
    endpointUpdateQueued: "Endpoint 更新已加入待确认，请确认后执行。",
    edit: "编辑",
    delete: "删除",
    noVps: "还没有注册 VPS。请先生成安装命令，并在测试 VPS 上运行。",
    addVps: "新增 VPS",
    addVpsHelp: "为新 agent 生成一次性安装命令。",
    customName: "自定义名称",
    username: "用户名",
    location: "位置",
    generateInstall: "生成安装命令",
    expires: "过期时间",
    aiOps: "AI 运维",
    aiOpsHelp: "输入诊断或运维指令。变更操作必须在页面端二次确认。",
    aiRules: "AI 系统规则",
    aiRulesHelp: "这些规则会注入每一次网页端和 Telegram 指令的 AI 规划提示词。",
    saveRules: "保存规则",
    rulesSaved: "AI 系统规则已保存。",
    runAi: "执行 AI 指令",
    pendingTitle: "待确认操作",
    pendingHelp: "变更操作 10 分钟后过期。",
    confirm: "确认执行",
    cancel: "取消",
    notificationTitle: "通知渠道",
    notificationHelp: "配置 Telegram、企业微信或通用 Webhook。",
    name: "名称",
    type: "类型",
    webhookUrl: "Webhook 地址",
    botToken: "Telegram Bot Token",
    chatId: "Telegram Chat ID",
    saveChannel: "保存渠道",
    saveAndTest: "保存并测试",
    test: "测试",
    editChannel: "编辑",
    channelSaved: "通知渠道已保存。",
    channelTested: "通知测试已发送。",
    audit: "操作审计",
    auditHelp: "最近的页面、Telegram、agent 和系统操作。",
    noOps: "暂无操作记录。",
    noSnapshot: "还没有实时快照。",
    lastSeen: "最后在线",
    serverNamePrompt: "服务器名称",
    locationPrompt: "位置",
    deleteConfirm: "确定从 EdgeButler 删除这台 VPS？"
  }
} satisfies Record<Language, Record<string, string>>;

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers
    }
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}

function formatDate(value?: string, language: Language = "en") {
  if (!value) return "never";
  return new Date(value).toLocaleString(language === "zh" ? "zh-CN" : "en-US");
}

function StatusPill({
  status,
  language
}: {
  status: ManagedServer["status"];
  language: Language;
}) {
  const labels = {
    en: {
      pending: "pending",
      online: "online",
      offline: "offline",
      unknown: "unknown"
    },
    zh: {
      pending: "待安装",
      online: "运行中",
      offline: "已离线",
      unknown: "未知"
    }
  };

  const dotClass = {
    online: "dot-online",
    offline: "dot-offline",
    pending: "dot-offline animate-pulse",
    unknown: "dot-offline"
  }[status];

  return (
    <span
      className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
        status === "online"
          ? "text-emerald-400 bg-emerald-400/10"
          : "text-slate-400 bg-slate-400/10"
      }`}
    >
      <span className={`dot ${dotClass}`} />
      {labels[language][status]}
    </span>
  );
}

function Snapshot({
  snapshot,
  language
}: {
  snapshot?: ServerSnapshot;
  language: Language;
}) {
  const t = text[language];
  if (!snapshot)
    return <p className="text-slate-500 italic text-sm">{t.noSnapshot}</p>;
  const items = [
    ["Host", snapshot.hostname],
    ["OS", snapshot.os],
    ["Uptime", snapshot.uptime],
    ["Load", snapshot.load],
    ["Memory", snapshot.memory],
    ["Disk", snapshot.disk]
  ];

  return (
    <div className="grid grid-cols-2 gap-3 mt-4">
      {items.map(([label, value]) => (
        <div
          key={label}
          className="bg-white/5 border border-white/5 rounded-xl p-3"
        >
          <dt className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">
            {label}
          </dt>
          <dd className="text-slate-200 text-sm font-medium truncate">
            {value || "-"}
          </dd>
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const [language, setLanguage] = useState<Language>(() => {
    const saved = localStorage.getItem("edgebutler-language");
    return saved === "zh" || saved === "en" ? saved : "zh";
  });
  const [auth, setAuth] = useState<AuthStatus | null>(null);
  const [password, setPassword] = useState("");
  const [servers, setServers] = useState<ManagedServer[]>([]);
  const [operations, setOperations] = useState<OperationLog[]>([]);
  const [pendingOperations, setPendingOperations] = useState<
    PendingOperation[]
  >([]);
  const [notifications, setNotifications] = useState<NotificationChannel[]>([]);
  const [installToken, setInstallToken] = useState<InstallTokenResponse | null>(
    null
  );
  const [installForm, setInstallForm] = useState({
    name: "",
    username: "root",
    location: ""
  });
  const [agentEndpoint, setAgentEndpoint] = useState(() =>
    window.location.origin.replace(/\/+$/, "")
  );
  const [notificationForm, setNotificationForm] = useState({
    id: "",
    name: "",
    type: "wecom" as NotificationChannel["type"],
    url: "",
    botToken: "",
    chatId: ""
  });
  const [rules, setRules] = useState("");
  const [aiCommand, setAiCommand] = useState("");
  const [aiOutput, setAiOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const t = text[language];

  const onlineCount = useMemo(
    () => servers.filter((server) => server.status === "online").length,
    [servers]
  );
  const offlineCount = useMemo(
    () => servers.filter((server) => server.status === "offline").length,
    [servers]
  );
  const newestSnapshot = useMemo(
    () =>
      servers
        .map((server) => server.lastSnapshot?.collectedAt)
        .filter(Boolean)
        .sort()
        .at(-1),
    [servers]
  );

  async function reload() {
    const [
      serverData,
      operationData,
      pendingData,
      notificationData,
      rulesData
    ] = await Promise.all([
      api<ManagedServer[]>("/api/servers"),
      api<OperationLog[]>("/api/operations"),
      api<PendingOperation[]>("/api/pending-operations"),
      api<NotificationChannel[]>("/api/notifications"),
      api<RulesResponse>("/api/rules")
    ]);
    setServers(serverData);
    setOperations(operationData);
    setPendingOperations(pendingData);
    setNotifications(notificationData);
    setRules(rulesData.rules);
  }

  async function withLoading(task: () => Promise<void>) {
    setLoading(true);
    setError("");
    setNotice("");
    try {
      await task();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void withLoading(async () => {
      const status = await api<AuthStatus>("/api/auth/status");
      setAuth(status);
      if (status.authenticated) await reload();
    });
  }, []);

  function changeLanguage(next: Language) {
    setLanguage(next);
    localStorage.setItem("edgebutler-language", next);
  }

  function login() {
    void withLoading(async () => {
      const status = await api<AuthStatus>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ password })
      });
      setAuth(status);
      setPassword("");
      await reload();
    });
  }

  function logout() {
    void withLoading(async () => {
      const status = await api<AuthStatus>("/api/auth/logout", {
        method: "POST"
      });
      setAuth(status);
      setServers([]);
      setOperations([]);
      setPendingOperations([]);
      setNotifications([]);
      setInstallToken(null);
    });
  }

  function createInstallToken() {
    void withLoading(async () => {
      const data = await api<InstallTokenResponse>("/api/install-token", {
        method: "POST",
        body: JSON.stringify({
          name: installForm.name || undefined,
          username: installForm.username || undefined,
          location: installForm.location || undefined,
          ttlMinutes: 60
        })
      });
      setInstallToken(data);
      await reload();
    });
  }

  function refreshServer(serverId: string) {
    void withLoading(async () => {
      await api(`/api/servers/${encodeURIComponent(serverId)}/refresh`, {
        method: "POST"
      });
      await reload();
    });
  }

  function refreshAll() {
    void withLoading(async () => {
      await api("/api/servers/refresh-all", { method: "POST" });
      await reload();
    });
  }

  function createEndpointUpdate() {
    void withLoading(async () => {
      await api("/api/agent-endpoint/update-all", {
        method: "POST",
        body: JSON.stringify({ endpoint: agentEndpoint })
      });
      setNotice(t.endpointUpdateQueued);
      await reload();
    });
  }

  function editServer(server: ManagedServer) {
    const name = window.prompt(t.serverNamePrompt, server.name);
    if (name === null) return;
    const location = window.prompt(t.locationPrompt, server.location);
    if (location === null) return;
    void withLoading(async () => {
      await api(`/api/servers/${encodeURIComponent(server.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ name, location })
      });
      await reload();
    });
  }

  function deleteServer(server: ManagedServer) {
    if (!window.confirm(`${t.deleteConfirm}\n${server.name}`)) {
      return;
    }
    void withLoading(async () => {
      await api(`/api/servers/${encodeURIComponent(server.id)}`, {
        method: "DELETE"
      });
      await reload();
    });
  }

  function runAiCommand() {
    const command = aiCommand.trim();
    if (!command) return;
    void withLoading(async () => {
      const result = await api<{ text: string }>("/api/ai/run", {
        method: "POST",
        body: JSON.stringify({ command })
      });
      setAiOutput(result.text);
      await reload();
    });
  }

  function saveRules() {
    void withLoading(async () => {
      const result = await api<RulesResponse>("/api/rules", {
        method: "PATCH",
        body: JSON.stringify({ rules })
      });
      setRules(result.rules);
      setNotice(t.rulesSaved);
      await reload();
    });
  }

  function confirmOperation(operationId: string) {
    void withLoading(async () => {
      const result = await api<{ text: string }>(
        `/api/pending-operations/${encodeURIComponent(operationId)}/confirm`,
        { method: "POST" }
      );
      setAiOutput(result.text);
      await reload();
    });
  }

  function cancelOperation(operationId: string) {
    void withLoading(async () => {
      await api(
        `/api/pending-operations/${encodeURIComponent(operationId)}/cancel`,
        { method: "POST" }
      );
      await reload();
    });
  }

  function saveNotification() {
    void withLoading(async () => {
      const channel = await api<NotificationChannel>("/api/notifications", {
        method: "POST",
        body: JSON.stringify(notificationForm)
      });
      setNotificationForm({
        id: "",
        name: "",
        type: "wecom",
        url: "",
        botToken: "",
        chatId: ""
      });
      setNotice(
        channel.telegramWebhookUrl
          ? `${t.channelSaved} Telegram webhook: ${channel.telegramWebhookUrl}`
          : t.channelSaved
      );
      await reload();
    });
  }

  function saveAndTestNotification() {
    void withLoading(async () => {
      const channel = await api<NotificationChannel>("/api/notifications", {
        method: "POST",
        body: JSON.stringify(notificationForm)
      });
      await api(`/api/notifications/${encodeURIComponent(channel.id)}/test`, {
        method: "POST"
      });
      setNotificationForm({
        id: "",
        name: "",
        type: "wecom",
        url: "",
        botToken: "",
        chatId: ""
      });
      setNotice(
        channel.telegramWebhookUrl
          ? `${t.channelTested} Telegram webhook: ${channel.telegramWebhookUrl}`
          : t.channelTested
      );
      await reload();
    });
  }

  function testNotification(channelId: string) {
    void withLoading(async () => {
      const result = await api<{
        ok: boolean;
        telegramWebhookUrl?: string;
      }>(`/api/notifications/${encodeURIComponent(channelId)}/test`, {
        method: "POST"
      });
      setNotice(
        result.telegramWebhookUrl
          ? `${t.channelTested} Telegram webhook: ${result.telegramWebhookUrl}`
          : t.channelTested
      );
      await reload();
    });
  }

  function editNotification(channel: NotificationChannel) {
    setNotificationForm({
      id: channel.id,
      name: channel.name,
      type: channel.type,
      url: channel.url || "",
      botToken: channel.botToken || "",
      chatId: channel.chatId || ""
    });
    document.getElementById("notifications")?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }

  function deleteNotification(channelId: string) {
    void withLoading(async () => {
      await api(`/api/notifications/${encodeURIComponent(channelId)}`, {
        method: "DELETE"
      });
      await reload();
    });
  }

  if (!auth?.authenticated) {
    return (
      <main className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
        <div className="absolute top-6 right-6">
          <div className="flex gap-1 p-1 bg-white/5 border border-white/10 rounded-xl">
            <button
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${language === "zh" ? "bg-white/10 text-cyan-400" : "text-slate-400 hover:text-slate-100"}`}
              onClick={() => changeLanguage("zh")}
            >
              中文
            </button>
            <button
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${language === "en" ? "bg-white/10 text-cyan-400" : "text-slate-400 hover:text-slate-100"}`}
              onClick={() => changeLanguage("en")}
            >
              EN
            </button>
          </div>
        </div>

        <div className="w-full max-w-lg space-y-6">
          <section className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 shadow-lg shadow-cyan-500/20 mb-4">
              <span className="text-white text-2xl font-black tracking-tighter">
                EB
              </span>
            </div>
            <h1 className="text-4xl font-black tracking-tight text-white">
              {t.loginTitle}
            </h1>
            <p className="text-slate-400 leading-relaxed">{t.loginLead}</p>
          </section>

          {error && (
            <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-4 rounded-xl text-sm font-medium animate-in fade-in slide-in-from-top-2 duration-300">
              {error}
            </div>
          )}

          <section className="bg-slate-900/50 backdrop-blur-xl border border-white/10 p-8 rounded-3xl shadow-2xl space-y-6">
            {!auth?.authConfigured && (
              <div className="bg-amber-500/10 border border-amber-500/20 text-amber-400 p-3 rounded-lg text-xs font-medium">
                {t.noSecret}
              </div>
            )}
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest px-1">
                  {t.credential}
                </label>
                <input
                  type="password"
                  value={password}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:border-cyan-500/50 focus:ring-4 focus:ring-cyan-500/10 transition-all outline-none"
                  onChange={(event) => setPassword(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") login();
                  }}
                  placeholder="ADMIN_PASSWORD or ADMIN_TOKEN"
                />
              </div>
              <button
                disabled={loading || !password.trim()}
                onClick={login}
                className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold py-3 rounded-xl shadow-lg shadow-cyan-500/20 disabled:opacity-50 disabled:grayscale transition-all transform active:scale-[0.98]"
              >
                {loading ? "..." : t.signIn}
              </button>
            </div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 selection:bg-cyan-500/30">
      {/* Global Loading Bar */}
      <div
        className={`fixed top-0 left-0 right-0 h-1 bg-cyan-500 z-50 transition-transform duration-500 origin-left ${loading ? "scale-x-100" : "scale-x-0"}`}
      />

      <div className="shell flex flex-col lg:flex-row gap-8 px-4 lg:px-0">
        <aside className="w-full lg:w-56 shrink-0">
          <div className="sticky top-8 space-y-4">
            <div className="flex items-center justify-between lg:justify-start gap-3 px-4 mb-4 lg:mb-8">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
                  <span className="text-white text-lg font-black">EB</span>
                </div>
                <span className="text-xl font-black tracking-tight uppercase">
                  Butler
                </span>
              </div>

              {/* Mobile Logout (only visible on small screens) */}
              <button
                className="lg:hidden p-2 text-slate-400 hover:text-rose-400 transition-all"
                onClick={logout}
                title={t.signOut}
              >
                <SignOut size={24} weight="bold" />
              </button>
            </div>

            <nav className="flex lg:flex-col overflow-x-auto lg:overflow-visible pb-4 lg:pb-0 gap-1 lg:space-y-1 no-scrollbar">
              {[
                { href: "#fleet", label: t.fleet, icon: HardDrives },
                { href: "#ai", label: t.aiOps, icon: TerminalWindow },
                { href: "#install", label: t.addVps, icon: SelectionPlus },
                {
                  href: "#notifications",
                  label: t.notificationTitle,
                  icon: BellRinging
                },
                { href: "#audit", label: t.audit, icon: FileMagnifyingGlass }
              ].map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className="group flex items-center gap-3 px-4 py-3 text-sm font-bold text-slate-400 hover:text-cyan-400 hover:bg-white/5 rounded-xl transition-all border-l-2 border-transparent hover:border-cyan-400/50 whitespace-nowrap"
                >
                  <item.icon size={18} weight="bold" />
                  {item.label}
                </a>
              ))}
            </nav>
          </div>
        </aside>

        <div className="flex-1 space-y-8 min-w-0">
          <header className="flex flex-col md:flex-row items-start md:items-center justify-between bg-slate-900/40 backdrop-blur-xl border border-white/5 p-6 rounded-[2rem] shadow-xl gap-6">
            <div className="space-y-1">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-500/80">
                EdgeButler / Core
              </p>
              <h1 className="text-2xl font-black tracking-tight">{t.title}</h1>
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-bold uppercase tracking-wider border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Live Polling
                </span>
                <span className="flex items-center gap-1 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  <Clock size={12} weight="bold" />
                  {t.lastSeen}: {formatDate(newestSnapshot, language)}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-4 w-full md:w-auto">
              <div className="flex items-center gap-1 p-1 bg-white/5 border border-white/10 rounded-xl flex-1 md:flex-initial justify-center">
                <Translate
                  size={14}
                  className="text-slate-500 ml-2 mr-1"
                  weight="bold"
                />
                <button
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${language === "zh" ? "bg-white/10 text-cyan-400" : "text-slate-400 hover:text-slate-100"}`}
                  onClick={() => changeLanguage("zh")}
                >
                  中
                </button>
                <button
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${language === "en" ? "bg-white/10 text-cyan-400" : "text-slate-400 hover:text-slate-100"}`}
                  onClick={() => changeLanguage("en")}
                >
                  EN
                </button>
              </div>
              <button
                className="hidden md:flex items-center gap-2 px-4 py-2 text-xs font-bold text-slate-400 hover:text-white bg-white/5 hover:bg-rose-500/10 border border-white/10 hover:border-rose-500/20 rounded-xl transition-all"
                onClick={logout}
              >
                <SignOut size={16} weight="bold" />
                {t.signOut}
              </button>
            </div>
          </header>

          <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 animate-stagger-1">
            {[
              {
                label: t.totalVps,
                value: servers.length,
                color: "text-white",
                icon: Monitor
              },
              {
                label: t.online,
                value: onlineCount,
                color: "text-emerald-400",
                icon: CheckCircle
              },
              {
                label: "Offline",
                value: offlineCount,
                color: "text-rose-400",
                icon: WarningCircle
              },
              {
                label: t.pending,
                value: pendingOperations.length,
                color: "text-amber-400",
                icon: Clock
              },
              {
                label: t.notifications,
                value: notifications.length,
                color: "text-cyan-400",
                icon: BellRinging
              }
            ].map((item) => (
              <div
                key={item.label}
                className="bg-slate-900/50 border border-white/5 p-5 rounded-2xl shadow-lg transition-transform hover:-translate-y-0.5 flex flex-col justify-between"
              >
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                    {item.label}
                  </p>
                  <item.icon
                    size={16}
                    className="text-slate-600"
                    weight="bold"
                  />
                </div>
                <span className={`text-3xl font-black ${item.color}`}>
                  {item.value}
                </span>
              </div>
            ))}
          </section>

          {error && (
            <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-4 rounded-xl text-sm font-medium animate-in fade-in slide-in-from-top-2 duration-300">
              {error}
            </div>
          )}
          {notice && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-4 rounded-xl text-sm font-medium animate-in fade-in slide-in-from-top-2 duration-300">
              {notice}
            </div>
          )}

          <section className="space-y-6 animate-stagger-2" id="fleet">
            <div className="flex items-end justify-between px-2">
              <div className="space-y-1">
                <h2 className="text-xl font-black tracking-tight">{t.fleet}</h2>
                <p className="text-xs font-medium text-slate-500">
                  {t.fleetHelp}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  className="px-4 py-2 text-xs font-bold bg-white/5 border border-white/10 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition-all"
                  disabled={loading}
                  onClick={reload}
                >
                  {t.reload}
                </button>
                <button
                  className="px-4 py-2 text-xs font-bold bg-white/5 border border-white/10 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition-all"
                  disabled={loading}
                  onClick={refreshAll}
                >
                  {t.refreshAll}
                </button>
              </div>
            </div>

            {servers.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 bg-slate-900/20 border border-dashed border-white/10 rounded-[2rem] text-slate-500 space-y-2">
                <p className="font-bold">{t.noVps}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-6">
                {servers.map((server) => (
                  <article
                    className="bg-slate-900/40 backdrop-blur-sm border border-white/5 p-6 rounded-3xl shadow-lg transition-all hover:border-white/10 hover:shadow-cyan-500/5 group"
                    key={server.id}
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="space-y-1 min-w-0">
                        <h3 className="text-lg font-black tracking-tight text-white truncate">
                          {server.name}
                        </h3>
                        <p className="text-xs font-bold text-cyan-400/70 font-mono tracking-tighter truncate">
                          {server.host}
                        </p>
                      </div>
                      <StatusPill status={server.status} language={language} />
                    </div>

                    <Snapshot
                      snapshot={server.lastSnapshot}
                      language={language}
                    />

                    <div className="mt-6 pt-6 border-t border-white/5 flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                      <span className="flex items-center gap-1">
                        <IdentificationCard size={12} weight="bold" /> ID:{" "}
                        <span className="text-slate-300 font-mono">
                          {server.id.slice(-8)}
                        </span>
                      </span>
                      <span className="flex items-center gap-1">
                        <MapPin size={12} weight="bold" /> {t.location}:{" "}
                        <span className="text-slate-300">
                          {server.location}
                        </span>
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock size={12} weight="bold" /> {t.lastSeen}:{" "}
                        <span className="text-slate-300">
                          {formatDate(server.lastSeenAt, language)}
                        </span>
                      </span>
                    </div>

                    <div className="mt-6 grid grid-cols-3 gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      <button
                        className="flex items-center justify-center gap-1.5 px-3 py-2 text-[10px] font-black uppercase tracking-widest bg-white/5 hover:bg-cyan-500/10 text-slate-400 hover:text-cyan-400 border border-white/5 hover:border-cyan-500/20 rounded-lg transition-all"
                        disabled={loading}
                        onClick={() => refreshServer(server.id)}
                      >
                        <RocketLaunch size={12} weight="bold" />
                        {t.refreshOne}
                      </button>
                      <button
                        className="flex items-center justify-center gap-1.5 px-3 py-2 text-[10px] font-black uppercase tracking-widest bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white border border-white/5 hover:border-white/20 rounded-lg transition-all"
                        disabled={loading}
                        onClick={() => editServer(server)}
                      >
                        <IdentificationCard size={12} weight="bold" />
                        {t.edit}
                      </button>
                      <button
                        className="flex items-center justify-center gap-1.5 px-3 py-2 text-[10px] font-black uppercase tracking-widest bg-white/5 hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 border border-white/5 hover:border-rose-500/20 rounded-lg transition-all"
                        disabled={loading}
                        onClick={() => deleteServer(server)}
                      >
                        <Trash size={12} weight="bold" />
                        {t.delete}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-stagger-3">
            <div
              className="bg-slate-900/40 backdrop-blur-sm border border-white/5 p-8 rounded-[2rem] shadow-xl space-y-6"
              id="install"
            >
              <div className="space-y-1">
                <h2 className="text-xl font-black tracking-tight text-white">
                  {t.addVps}
                </h2>
                <p className="text-xs font-medium text-slate-500">
                  {t.addVpsHelp}
                </p>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">
                      {t.customName}
                    </label>
                    <input
                      value={installForm.name}
                      onChange={(event) =>
                        setInstallForm((current) => ({
                          ...current,
                          name: event.target.value
                        }))
                      }
                      className="w-full bg-white/5 border border-white/5 rounded-xl px-4 py-2.5 text-sm text-white focus:border-cyan-500/50 transition-all outline-none"
                      placeholder="e.g. HK-Node-01"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">
                      {t.username}
                    </label>
                    <input
                      value={installForm.username}
                      onChange={(event) =>
                        setInstallForm((current) => ({
                          ...current,
                          username: event.target.value
                        }))
                      }
                      className="w-full bg-white/5 border border-white/5 rounded-xl px-4 py-2.5 text-sm text-white focus:border-cyan-500/50 transition-all outline-none"
                      placeholder="root"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">
                    {t.location}
                  </label>
                  <input
                    value={installForm.location}
                    onChange={(event) =>
                      setInstallForm((current) => ({
                        ...current,
                        location: event.target.value
                      }))
                    }
                    className="w-full bg-white/5 border border-white/5 rounded-xl px-4 py-2.5 text-sm text-white focus:border-cyan-500/50 transition-all outline-none"
                    placeholder="e.g. Hong Kong"
                  />
                </div>

                <button
                  disabled={loading}
                  onClick={createInstallToken}
                  className="w-full bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 font-bold py-3 rounded-xl border border-cyan-500/20 transition-all"
                >
                  {t.generateInstall}
                </button>

                {installToken && (
                  <div className="bg-black/40 border border-white/5 rounded-2xl p-5 space-y-3">
                    <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest text-slate-500 border-b border-white/5 pb-2">
                      <span>{t.expires}</span>
                      <span className="text-amber-400">
                        {formatDate(installToken.expiresAt, language)}
                      </span>
                    </div>
                    <pre className="text-xs font-mono text-cyan-400 overflow-x-auto p-1 leading-relaxed">
                      {installToken.installCommand}
                    </pre>
                  </div>
                )}

                <div className="pt-6 border-t border-white/5 space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">
                      {t.agentEndpoint}
                    </label>
                    <input
                      value={agentEndpoint}
                      onChange={(event) => setAgentEndpoint(event.target.value)}
                      className="w-full bg-white/5 border border-white/5 rounded-xl px-4 py-2.5 text-sm text-white focus:border-cyan-500/50 transition-all outline-none"
                      placeholder="https://ops.example.com"
                    />
                  </div>
                  <button
                    className="w-full bg-white/5 hover:bg-white/10 text-slate-300 font-bold py-3 rounded-xl border border-white/10 transition-all text-xs"
                    disabled={loading || !agentEndpoint.trim()}
                    onClick={createEndpointUpdate}
                  >
                    {t.updateAgentEndpoint}
                  </button>
                </div>
              </div>
            </div>

            <div
              className="bg-slate-900/40 backdrop-blur-sm border border-white/5 p-8 rounded-[2rem] shadow-xl flex flex-col"
              id="ai"
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-cyan-500/10 rounded-lg text-cyan-400">
                  <TerminalWindow size={20} weight="bold" />
                </div>
                <div className="space-y-1">
                  <h2 className="text-xl font-black tracking-tight text-white">
                    {t.aiOps}
                  </h2>
                  <p className="text-xs font-medium text-slate-500">
                    {t.aiOpsHelp}
                  </p>
                </div>
              </div>

              <div className="flex-1 flex flex-col space-y-4">
                <textarea
                  value={aiCommand}
                  onChange={(event) => setAiCommand(event.target.value)}
                  className="flex-1 bg-white/5 border border-white/5 rounded-2xl p-4 text-sm text-white placeholder:text-slate-600 focus:border-cyan-500/50 transition-all outline-none resize-none min-h-[120px]"
                  placeholder="e.g. Check CPU usage on all Hong Kong nodes"
                />

                <div className="flex gap-3">
                  <button
                    disabled={loading || !aiCommand.trim()}
                    onClick={runAiCommand}
                    className="flex-1 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-black py-3 rounded-xl shadow-lg shadow-cyan-500/20 transition-all transform active:scale-[0.98]"
                  >
                    {t.runAi}
                  </button>
                </div>

                {aiOutput && (
                  <div className="mt-4 bg-black/60 border border-white/5 rounded-2xl p-5 overflow-hidden">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3 border-b border-white/5 pb-2">
                      Response
                    </p>
                    <pre className="text-sm font-medium text-slate-300 whitespace-pre-wrap leading-relaxed max-h-[300px] overflow-y-auto">
                      {aiOutput}
                    </pre>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-slate-900/40 backdrop-blur-sm border border-white/5 p-8 rounded-[2rem] shadow-xl space-y-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/10 rounded-lg text-blue-400">
                  <FileMagnifyingGlass size={20} weight="bold" />
                </div>
                <div className="space-y-1">
                  <h2 className="text-xl font-black tracking-tight text-white">
                    {t.aiRules}
                  </h2>
                  <p className="text-xs font-medium text-slate-500">
                    {t.aiRulesHelp}
                  </p>
                </div>
              </div>
              <textarea
                value={rules}
                onChange={(event) => setRules(event.target.value)}
                className="w-full bg-white/5 border border-white/5 rounded-2xl p-4 text-sm text-white placeholder:text-slate-600 focus:border-cyan-500/50 transition-all outline-none resize-none min-h-[120px]"
                placeholder="Custom AI behavior rules..."
              />
              <button
                disabled={loading}
                onClick={saveRules}
                className="w-full bg-white/5 hover:bg-white/10 text-slate-300 font-bold py-3 rounded-xl border border-white/10 transition-all text-xs"
              >
                {t.saveRules}
              </button>
            </div>
          </section>

          {pendingOperations.length > 0 && (
            <section className="bg-rose-500/5 border border-rose-500/10 p-8 rounded-[2rem] shadow-xl space-y-6">
              <div className="space-y-1">
                <h2 className="text-xl font-black tracking-tight text-rose-400 uppercase tracking-widest">
                  {t.pendingTitle}
                </h2>
                <p className="text-xs font-medium text-slate-500">
                  {t.pendingHelp}
                </p>
              </div>
              <div className="grid gap-4">
                {pendingOperations.map((operation) => (
                  <div
                    className="flex items-center justify-between p-6 bg-rose-500/5 border border-rose-500/10 rounded-2xl transition-all hover:bg-rose-500/10"
                    key={operation.id}
                  >
                    <div className="space-y-1">
                      <strong className="text-rose-400 font-black tracking-tight">
                        {operation.action}
                      </strong>
                      <p className="text-sm font-medium text-slate-300">
                        {operation.serverName} /{" "}
                        <span className="font-mono text-xs">
                          {operation.command || operation.target || "no target"}
                        </span>
                      </p>
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                        {t.expires}: {formatDate(operation.expiresAt, language)}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        className="px-6 py-2 bg-rose-500 hover:bg-rose-400 text-white text-xs font-black uppercase tracking-widest rounded-xl shadow-lg shadow-rose-500/20 transition-all active:scale-95"
                        disabled={loading}
                        onClick={() => confirmOperation(operation.id)}
                      >
                        {t.confirm}
                      </button>
                      <button
                        className="px-6 py-2 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white border border-white/10 rounded-xl text-xs font-black uppercase tracking-widest transition-all active:scale-95"
                        disabled={loading}
                        onClick={() => cancelOperation(operation.id)}
                      >
                        {t.cancel}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section
            className="bg-slate-900/40 backdrop-blur-sm border border-white/5 p-8 rounded-[2rem] shadow-xl space-y-8"
            id="notifications"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500/10 rounded-lg text-purple-400">
                <BellRinging size={20} weight="bold" />
              </div>
              <div className="space-y-1">
                <h2 className="text-xl font-black tracking-tight text-white">
                  {t.notificationTitle}
                </h2>
                <p className="text-xs font-medium text-slate-500">
                  {t.notificationHelp}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 items-end">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">
                  {t.name}
                </label>
                <input
                  value={notificationForm.name}
                  onChange={(event) =>
                    setNotificationForm((current) => ({
                      ...current,
                      name: event.target.value
                    }))
                  }
                  className="w-full bg-white/5 border border-white/5 rounded-xl px-4 py-2.5 text-sm text-white focus:border-cyan-500/50 transition-all outline-none"
                  placeholder="e.g. Ops Alert"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">
                  {t.type}
                </label>
                <select
                  value={notificationForm.type}
                  onChange={(event) =>
                    setNotificationForm((current) => ({
                      ...current,
                      type: event.target.value as NotificationChannel["type"]
                    }))
                  }
                  className="w-full bg-white/5 border border-white/5 rounded-xl px-4 py-2.5 text-sm text-white focus:border-cyan-500/50 transition-all outline-none appearance-none"
                >
                  <option value="wecom" className="bg-slate-900">
                    Enterprise WeChat
                  </option>
                  <option value="telegram" className="bg-slate-900">
                    Telegram
                  </option>
                  <option value="generic_webhook" className="bg-slate-900">
                    Generic webhook
                  </option>
                </select>
              </div>

              {notificationForm.type !== "telegram" ? (
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">
                    {t.webhookUrl}
                  </label>
                  <input
                    value={notificationForm.url}
                    onChange={(event) =>
                      setNotificationForm((current) => ({
                        ...current,
                        url: event.target.value
                      }))
                    }
                    className="w-full bg-white/5 border border-white/5 rounded-xl px-4 py-2.5 text-sm text-white focus:border-cyan-500/50 transition-all outline-none"
                    placeholder="https://..."
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">
                    {t.botToken}
                  </label>
                  <input
                    type="password"
                    value={notificationForm.botToken}
                    onChange={(event) =>
                      setNotificationForm((current) => ({
                        ...current,
                        botToken: event.target.value
                      }))
                    }
                    className="w-full bg-white/5 border border-white/5 rounded-xl px-4 py-2.5 text-sm text-white focus:border-cyan-500/50 transition-all outline-none"
                    placeholder="Token"
                  />
                </div>
              )}

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">
                  {t.chatId}
                </label>
                <input
                  value={notificationForm.chatId}
                  onChange={(event) =>
                    setNotificationForm((current) => ({
                      ...current,
                      chatId: event.target.value
                    }))
                  }
                  className="w-full bg-white/5 border border-white/5 rounded-xl px-4 py-2.5 text-sm text-white focus:border-cyan-500/50 transition-all outline-none"
                  placeholder="Only for Telegram"
                />
              </div>

              <div className="flex gap-2 col-span-1 md:col-span-2 xl:col-span-1">
                <button
                  disabled={loading || !notificationForm.name.trim()}
                  onClick={saveNotification}
                  className="flex-1 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 font-bold py-3 rounded-xl border border-cyan-500/20 transition-all text-xs uppercase tracking-widest"
                >
                  {t.saveChannel}
                </button>
                <button
                  disabled={loading || !notificationForm.name.trim()}
                  onClick={saveAndTestNotification}
                  className="flex-1 bg-white/5 hover:bg-white/10 text-slate-300 font-bold py-3 rounded-xl border border-white/10 transition-all text-xs uppercase tracking-widest"
                >
                  {t.saveAndTest}
                </button>
              </div>
            </div>

            {notifications.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {notifications.map((channel) => (
                  <div
                    className="p-5 bg-white/5 border border-white/5 rounded-2xl flex items-center justify-between group transition-all hover:bg-white/10"
                    key={channel.id}
                  >
                    <div className="space-y-1">
                      <strong className="text-white font-black tracking-tight">
                        {channel.name}
                      </strong>
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                        {channel.type}
                      </p>
                      {channel.type === "telegram" &&
                        channel.telegramWebhookStatus && (
                          <p className="text-[10px] font-bold text-cyan-400/80 uppercase truncate max-w-[200px]">
                            {channel.telegramWebhookStatus}
                          </p>
                        )}
                    </div>
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        className="p-2 text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-all"
                        disabled={loading}
                        onClick={() => testNotification(channel.id)}
                        title={t.test}
                      >
                        <span className="text-[10px] font-black uppercase px-2">
                          {t.test}
                        </span>
                      </button>
                      <button
                        className="p-2 text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-all"
                        disabled={loading}
                        onClick={() => editNotification(channel)}
                        title={t.editChannel}
                      >
                        <span className="text-[10px] font-black uppercase px-2">
                          {t.editChannel}
                        </span>
                      </button>
                      <button
                        className="p-2 text-slate-400 hover:text-rose-400 bg-white/5 hover:bg-rose-500/10 rounded-lg transition-all"
                        disabled={loading}
                        onClick={() => deleteNotification(channel.id)}
                        title={t.delete}
                      >
                        <span className="text-[10px] font-black uppercase px-2">
                          {t.delete}
                        </span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section
            className="bg-slate-900/40 backdrop-blur-sm border border-white/5 p-8 rounded-[2rem] shadow-xl space-y-6 animate-stagger-4"
            id="audit"
          >
            <div className="space-y-1">
              <h2 className="text-xl font-black tracking-tight text-white">
                {t.audit}
              </h2>
              <p className="text-xs font-medium text-slate-500">
                {t.auditHelp}
              </p>
            </div>
            {operations.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 bg-slate-900/20 border border-dashed border-white/10 rounded-[2rem] text-slate-500 space-y-2">
                <p className="font-bold">{t.noOps}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {operations.slice(0, 20).map((operation) => (
                  <div
                    className="grid grid-cols-4 gap-4 p-4 bg-white/5 border border-white/5 rounded-xl text-xs font-bold transition-all hover:bg-white/10 group"
                    key={operation.id}
                  >
                    <span className="text-slate-500 group-hover:text-slate-400">
                      {formatDate(operation.createdAt, language)}
                    </span>
                    <strong className="text-slate-200 uppercase tracking-tight">
                      {operation.action}
                    </strong>
                    <em className="not-italic text-cyan-400/80 uppercase tracking-widest text-[10px]">
                      {operation.source}
                    </em>
                    <code className="text-slate-400 font-mono truncate">
                      {operation.serverId || "-"}
                    </code>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
