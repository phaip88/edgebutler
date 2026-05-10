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
      pending: "connecting",
      online: "active",
      offline: "offline",
      unknown: "unknown"
    },
    zh: {
      pending: "协议握手",
      online: "运行中",
      offline: "已断开",
      unknown: "未知"
    }
  };

  const dotClass = {
    online: "dot-online",
    offline: "dot-offline",
    pending: "dot-pending",
    unknown: "dot-offline opacity-50"
  }[status];

  return (
    <span
      className={`inline-flex items-center px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-[0.2em] transition-all ui-status-pill-glow ${
        status === "online"
          ? "text-emerald-400 bg-emerald-400/5 border-emerald-500/20"
          : status === "pending"
            ? "text-amber-400 bg-amber-400/5 border-amber-500/20"
            : "text-slate-500 bg-white/5 border-white/5"
      }`}
    >
      <span className={`dot ${dotClass} mr-3 scale-110`} />
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
      {items.map(([label, value]) => {
        // Simple heuristic to extract percentage for visual bars
        let percent = 0;
        if (value && (label === "Memory" || label === "Disk")) {
          const match = value.match(/(\d+)%/);
          if (match) {
            percent = parseInt(match[1]);
          } else if (label === "Memory") {
            const parts = value.match(/(\d+)\/(\d+)\s*MB/);
            if (parts)
              percent = (parseInt(parts[1]) / parseInt(parts[2])) * 100;
          }
        }

        return (
          <div
            key={label}
            className="bg-white/5 border border-white/5 rounded-xl p-3 relative overflow-hidden ui-bg-scanline"
          >
            <dt className="text-[10px] uppercase tracking-widest text-slate-500 font-black mb-1">
              {label}
            </dt>
            <dd className="text-slate-200 text-sm font-bold truncate relative z-10">
              {value || "-"}
            </dd>
            {percent > 0 && (
              <div className="ui-tech-bar w-full">
                <div
                  className="ui-tech-bar-fill"
                  style={{ width: `${Math.min(percent, 100)}%` }}
                />
              </div>
            )}
          </div>
        );
      })}
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
      <main className="min-h-screen bg-slate-950 flex items-center justify-center p-6 relative overflow-hidden">
        {/* Sci-Fi Scanline Effect */}
        <div className="ui-scanline" />

        <div className="absolute top-6 right-6 z-20">
          <div className="flex gap-1 p-1 bg-black/40 backdrop-blur border border-white/10 rounded-xl">
            <button
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${language === "zh" ? "bg-cyan-500/20 text-cyan-400" : "text-slate-500 hover:text-slate-200"}`}
              onClick={() => changeLanguage("zh")}
            >
              ZH
            </button>
            <button
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${language === "en" ? "bg-cyan-500/20 text-cyan-400" : "text-slate-500 hover:text-slate-200"}`}
              onClick={() => changeLanguage("en")}
            >
              EN
            </button>
          </div>
        </div>

        <div className="w-full max-w-lg space-y-8 relative z-10">
          <section className="text-center space-y-4 animate-in fade-in zoom-in duration-700">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-[1.5rem] bg-gradient-to-br from-cyan-500 to-blue-600 shadow-[0_0_40px_rgba(0,255,255,0.2)] mb-4 ui-glitch-hover cursor-pointer border border-cyan-400/30">
              <span className="text-white text-3xl font-black tracking-tighter">
                EB
              </span>
            </div>
            <div className="space-y-1">
              <h1 className="text-5xl font-black tracking-tighter text-white bg-gradient-to-b from-white to-slate-500 bg-clip-text text-transparent">
                {t.loginTitle}
              </h1>
              <p className="text-slate-400 font-bold uppercase tracking-[0.2em] text-[10px] opacity-60">
                {t.loginLead}
              </p>
            </div>
          </section>

          {error && (
            <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-5 rounded-2xl text-xs font-black uppercase tracking-widest animate-in slide-in-from-top-4 duration-500 flex items-center gap-3">
              <WarningCircle size={18} />
              {error}
            </div>
          )}

          <section className="bg-slate-900/60 backdrop-blur-3xl border border-white/10 p-10 rounded-[3rem] shadow-2xl space-y-8 ui-corner-brackets ui-bg-scanline relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />

            {!auth?.authConfigured && (
              <div className="bg-amber-500/10 border border-amber-500/20 text-amber-400 p-4 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-3 relative z-10">
                <WarningCircle size={16} />
                {t.noSecret}
              </div>
            )}

            <div className="space-y-6 relative z-10">
              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] px-1 block">
                  {t.credential}
                </label>
                <div className="relative group/input">
                  <input
                    type="password"
                    value={password}
                    className="w-full bg-black/40 border border-white/10 rounded-2xl px-6 py-4 text-white placeholder:text-slate-700 focus:border-cyan-500/50 focus:ring-8 focus:ring-cyan-500/5 transition-all outline-none font-mono text-sm"
                    onChange={(event) => setPassword(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") login();
                    }}
                    placeholder="PROTOCOL_KEY"
                  />
                  <div className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-700 group-focus-within/input:text-cyan-500/50 transition-colors">
                    <IdentificationCard size={20} />
                  </div>
                </div>
              </div>

              <button
                disabled={loading || !password.trim()}
                onClick={login}
                className="w-full bg-gradient-to-r from-cyan-600 to-blue-700 hover:from-cyan-500 hover:to-blue-600 text-white font-black py-5 rounded-2xl shadow-xl shadow-cyan-950/20 disabled:opacity-20 disabled:grayscale transition-all transform active:scale-[0.98] uppercase tracking-[0.3em] text-[10px] flex items-center justify-center gap-3"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    <span>AUTHENTICATING...</span>
                  </>
                ) : (
                  <>
                    <RocketLaunch size={18} />
                    <span>{t.signIn}</span>
                  </>
                )}
              </button>
            </div>
          </section>

          <p className="text-center text-[9px] font-black text-slate-600 uppercase tracking-[0.4em]">
            Secure Operations Channel v1.0.42
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 selection:bg-cyan-500/30 overflow-x-hidden pb-32">
      {/* Sci-Fi Scanline Effect */}
      <div className="ui-scanline" />

      {/* Global Loading Bar */}
      <div
        className={`fixed top-0 left-0 right-0 h-0.5 bg-cyan-500 z-[100] transition-transform duration-500 origin-left ${loading ? "scale-x-100" : "scale-x-0"}`}
      />

      {/* Sidebar Hack Infrastructure */}
      <input
        type="checkbox"
        id="sidebar-toggle"
        className="peer/sidebar hidden"
        defaultChecked={false}
      />

      <div className="flex min-h-screen relative">
        {/* Sidebar */}
        <aside className="fixed left-0 top-0 bottom-0 z-50 w-64 peer-checked/sidebar:w-20 bg-slate-900/80 backdrop-blur-2xl border-r border-cyan-500/10 transition-all duration-300 group/sidebar overflow-hidden flex flex-col ui-bg-scanline">
          <div className="flex items-center gap-4 p-6 mb-4">
            <label
              htmlFor="sidebar-toggle"
              className="cursor-pointer hover:text-cyan-400 transition-colors shrink-0 ui-glitch-hover"
              aria-label="Toggle Sidebar"
            >
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
                <span className="text-white text-lg font-black tracking-tighter">
                  EB
                </span>
              </div>
            </label>
            <span className="text-xl font-black tracking-tight uppercase transition-opacity duration-300 peer-checked/sidebar:opacity-0 group-hover/sidebar:peer-checked/sidebar:opacity-100 whitespace-nowrap">
              Butler
            </span>
          </div>

          <nav className="flex-1 px-3 space-y-2">
            {[
              { href: "#fleet", label: t.fleet, icon: HardDrives },
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
                className="group flex items-center gap-4 px-4 py-3 text-sm font-bold text-slate-400 hover:text-cyan-400 hover:bg-cyan-500/5 rounded-xl transition-all border-l-2 border-transparent hover:border-cyan-400/50"
              >
                <item.icon size={22} className="shrink-0" />
                <span className="transition-all duration-300 peer-checked/sidebar:opacity-0 group-hover/sidebar:peer-checked/sidebar:opacity-100 whitespace-nowrap">
                  {item.label}
                </span>
              </a>
            ))}
          </nav>

          <div className="p-4 border-t border-cyan-500/5">
            <button
              className="flex items-center gap-4 w-full px-4 py-3 text-sm font-bold text-slate-500 hover:text-rose-400 hover:bg-rose-500/5 rounded-xl transition-all"
              onClick={logout}
            >
              <SignOut size={22} className="shrink-0" />
              <span className="transition-all duration-300 peer-checked/sidebar:opacity-0 group-hover/sidebar:peer-checked/sidebar:opacity-100 whitespace-nowrap">
                {t.signOut}
              </span>
            </button>
          </div>
        </aside>

        {/* Main Content Area */}
        <div className="flex-1 ml-64 peer-checked/sidebar:ml-20 transition-all duration-300 min-w-0">
          <div className="shell py-8 px-8 space-y-12">
            <header className="flex flex-col md:flex-row items-start md:items-center justify-between bg-slate-900/40 backdrop-blur-xl border border-white/5 p-8 rounded-[2.5rem] shadow-2xl gap-6 relative overflow-hidden group ui-corner-brackets ui-bg-scanline">
              <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/5 blur-3xl rounded-full -mr-20 -mt-20 group-hover:bg-cyan-500/10 transition-colors" />

              <div className="space-y-1 relative z-10">
                <div className="flex items-center gap-2">
                  <Monitor size={12} className="text-cyan-500" />
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-500/80">
                    System Control / Core v1.1
                  </p>
                  <span className="ui-hud-tag ml-4">[SEC_PROTOCOL_V4]</span>
                </div>
                <h1 className="text-4xl font-black tracking-tight bg-gradient-to-r from-white via-white to-slate-500 bg-clip-text text-transparent">
                  {t.title}
                </h1>

                <div className="flex flex-wrap items-center gap-4 pt-2">
                  <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-black uppercase tracking-widest border border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.1)]">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse-green-tech" />
                    Live Interface
                  </span>
                  <span className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest bg-white/5 px-3 py-1 rounded-full border border-white/5">
                    <Clock size={12} />
                    {t.lastSeen}:{" "}
                    <span className="text-slate-300 ml-1">
                      {formatDate(newestSnapshot, language)}
                    </span>
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-4 w-full md:w-auto relative z-10">
                <div className="flex items-center gap-1 p-1.5 bg-black/40 backdrop-blur border border-white/10 rounded-2xl flex-1 md:flex-initial">
                  <Translate
                    size={14}
                    className="text-slate-500 ml-2 mr-1"
                    weight="bold"
                  />
                  <button
                    className={`flex-1 md:flex-initial px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${language === "zh" ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/20" : "text-slate-500 hover:text-slate-200"}`}
                    onClick={() => changeLanguage("zh")}
                  >
                    ZH
                  </button>
                  <button
                    className={`flex-1 md:flex-initial px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${language === "en" ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/20" : "text-slate-500 hover:text-slate-200"}`}
                    onClick={() => changeLanguage("en")}
                  >
                    EN
                  </button>
                </div>
              </div>
            </header>

            <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6 animate-stagger-1">
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
                  className="ui-glass-tech p-6 rounded-3xl transition-all hover:border-cyan-500/30 flex flex-col justify-between group shadow-xl"
                >
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 group-hover:text-cyan-500/80 transition-colors">
                      {item.label}
                    </p>
                    <item.icon
                      size={18}
                      className="text-slate-600 group-hover:text-cyan-500/50 transition-colors"
                    />
                  </div>
                  <span
                    className={`text-4xl font-black tracking-tighter ${item.color}`}
                  >
                    {item.value}
                  </span>
                </div>
              ))}
            </section>

            {error && (
              <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-6 rounded-3xl text-sm font-bold animate-in fade-in slide-in-from-top-4 duration-500 flex items-center gap-3">
                <WarningCircle size={20} />
                {error}
              </div>
            )}
            {notice && (
              <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-6 rounded-3xl text-sm font-bold animate-in fade-in slide-in-from-top-4 duration-500 flex items-center gap-3">
                <CheckCircle size={20} />
                {notice}
              </div>
            )}

            <div className="section-divider" />

            {/* VPS Cluster - Horizontal Scroll */}
            <section className="space-y-6 animate-stagger-2" id="fleet">
              <div className="flex items-end justify-between px-2">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <HardDrives
                      size={16}
                      className="text-cyan-500"
                      weight="bold"
                    />
                    <h2 className="text-2xl font-black tracking-tight">
                      {t.fleet}
                    </h2>
                  </div>
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-widest">
                    {t.fleetHelp}
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    className="flex items-center gap-2 px-6 py-2.5 text-xs font-black uppercase tracking-widest bg-white/5 border border-white/10 rounded-2xl text-slate-400 hover:text-white hover:bg-cyan-500/10 hover:border-cyan-500/30 transition-all shadow-lg"
                    disabled={loading}
                    onClick={reload}
                  >
                    <RocketLaunch size={14} />
                    {t.reload}
                  </button>
                  <button
                    className="flex items-center gap-2 px-6 py-2.5 text-xs font-black uppercase tracking-widest bg-cyan-500/10 border border-cyan-500/20 rounded-2xl text-cyan-400 hover:text-white hover:bg-cyan-500 hover:border-cyan-500 transition-all shadow-cyan-500/10 shadow-lg"
                    disabled={loading}
                    onClick={refreshAll}
                  >
                    <CheckCircle size={14} />
                    {t.refreshAll}
                  </button>
                </div>
              </div>

              {servers.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-20 bg-slate-900/20 border border-dashed border-cyan-500/10 rounded-[3rem] text-slate-500 space-y-4">
                  <Monitor size={48} className="opacity-20" />
                  <p className="font-black uppercase tracking-widest text-sm">
                    {t.noVps}
                  </p>
                </div>
              ) : (
                <div className="flex flex-row overflow-x-auto gap-8 pb-8 custom-scrollbar snap-x snap-mandatory px-2 -mx-2">
                  {servers.map((server) => (
                    <article
                      className="min-w-[380px] w-[400px] shrink-0 snap-start bg-slate-900/60 backdrop-blur-md border border-white/5 p-8 rounded-[2.5rem] shadow-2xl transition-all hover:border-cyan-500/40 hover:-translate-y-2 group relative overflow-hidden ui-corner-brackets"
                      key={server.id}
                    >
                      <div className="ui-sweep-effect" />
                      {server.status !== "online" && (
                        <div className="absolute inset-0 offline-overlay z-10 flex items-center justify-center backdrop-grayscale-[0.5]" />
                      )}
                      {loading && (
                        <>
                          <div className="ui-skeleton-overlay" />
                          <div className="absolute inset-0 z-30 flex items-center justify-center">
                            <span className="text-[10px] font-black text-cyan-400 uppercase tracking-[0.4em] animate-pulse">
                              Scanning_Node_Data...
                            </span>
                          </div>
                        </>
                      )}

                      <div className="flex items-start justify-between mb-6 relative z-20">
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="ui-hud-tag">[AUTH_V2]</span>
                            <span className="ui-hud-tag">[IP_STR_ENC]</span>
                          </div>
                          <h3 className="text-xl font-black tracking-tight text-white truncate group-hover:text-cyan-400 transition-colors">
                            {server.name}
                          </h3>
                          <p className="text-[10px] font-black text-cyan-500/40 font-mono tracking-wider truncate uppercase">
                            {server.host}
                          </p>
                        </div>
                        <StatusPill
                          status={server.status}
                          language={language}
                        />
                      </div>

                      <div className="relative z-20">
                        <Snapshot
                          snapshot={server.lastSnapshot}
                          language={language}
                        />
                      </div>

                      <div className="mt-8 pt-8 border-t border-white/5 flex flex-wrap items-center gap-x-6 gap-y-3 text-[10px] font-black text-slate-500 uppercase tracking-[0.15em] relative z-20">
                        <span className="flex items-center gap-1.5">
                          <IdentificationCard
                            size={14}
                            weight="bold"
                            className="text-cyan-500/50"
                          />{" "}
                          ID:{" "}
                          <span className="text-slate-300 font-mono">
                            {server.id.slice(-8)}
                          </span>
                        </span>
                        <span className="flex items-center gap-1.5">
                          <MapPin
                            size={14}
                            weight="bold"
                            className="text-cyan-500/50"
                          />{" "}
                          {t.location}:{" "}
                          <span className="text-slate-300">
                            {server.location}
                          </span>
                        </span>
                      </div>

                      <div className="mt-8 grid grid-cols-3 gap-3 opacity-0 group-hover:opacity-100 transition-all duration-500 translate-y-4 group-hover:translate-y-0 relative z-20">
                        <button
                          className="flex flex-col items-center justify-center gap-2 p-3 bg-white/5 hover:bg-cyan-500/20 text-slate-400 hover:text-cyan-400 border border-white/5 hover:border-cyan-500/40 rounded-2xl transition-all"
                          disabled={loading}
                          onClick={() => refreshServer(server.id)}
                        >
                          <RocketLaunch size={20} />
                          <span className="text-[9px] font-black uppercase tracking-tighter">
                            {t.refreshOne}
                          </span>
                        </button>
                        <button
                          className="flex flex-col items-center justify-center gap-2 p-3 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white border border-white/5 hover:border-white/20 rounded-2xl transition-all"
                          disabled={loading}
                          onClick={() => editServer(server)}
                        >
                          <IdentificationCard size={20} />
                          <span className="text-[9px] font-black uppercase tracking-tighter">
                            {t.edit}
                          </span>
                        </button>
                        <button
                          className="flex flex-col items-center justify-center gap-2 p-3 bg-white/5 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-white/5 hover:border-rose-500/40 rounded-2xl transition-all"
                          disabled={loading}
                          onClick={() => deleteServer(server)}
                        >
                          <Trash size={20} />
                          <span className="text-[9px] font-black uppercase tracking-tighter">
                            {t.delete}
                          </span>
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <div className="section-divider" />

            <section className="grid grid-cols-1 lg:grid-cols-2 gap-12 animate-stagger-3 items-start">
              {/* New VPS Form */}
              <div
                className="ui-glass-tech p-10 rounded-[3rem] shadow-2xl space-y-8 ui-corner-brackets"
                id="install"
              >
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-cyan-500/10 rounded-2xl text-cyan-400">
                    <SelectionPlus size={24} />
                  </div>
                  <div className="space-y-1">
                    <h2 className="text-2xl font-black tracking-tight text-white">
                      {t.addVps}
                    </h2>
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                      {t.addVpsHelp}
                    </p>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-3">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] px-1">
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
                        className="w-full bg-black/40 border border-white/5 rounded-2xl px-5 py-4 text-sm text-white focus:border-cyan-500/50 transition-all outline-none"
                        placeholder="HK-PROX-01"
                      />
                    </div>
                    <div className="space-y-3">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] px-1">
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
                        className="w-full bg-black/40 border border-white/5 rounded-2xl px-5 py-4 text-sm text-white focus:border-cyan-500/50 transition-all outline-none"
                        placeholder="root"
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] px-1">
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
                      className="w-full bg-black/40 border border-white/5 rounded-2xl px-5 py-4 text-sm text-white focus:border-cyan-500/50 transition-all outline-none"
                      placeholder="TOKYO-DC-01"
                    />
                  </div>

                  <button
                    disabled={loading}
                    onClick={createInstallToken}
                    className="w-full bg-gradient-to-r from-cyan-600 to-blue-700 hover:from-cyan-500 hover:to-blue-600 text-white font-black py-5 rounded-[1.5rem] shadow-xl shadow-cyan-950/20 transition-all transform active:scale-[0.98] uppercase tracking-[0.2em] text-xs"
                  >
                    {t.generateInstall}
                  </button>

                  {installToken && (
                    <div className="bg-black/60 border border-cyan-500/20 rounded-3xl p-6 space-y-4 animate-in zoom-in-95 duration-300">
                      <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 border-b border-white/5 pb-4">
                        <span className="flex items-center gap-2">
                          <Clock size={14} className="text-amber-500" />{" "}
                          {t.expires}
                        </span>
                        <span className="text-amber-400">
                          {formatDate(installToken.expiresAt, language)}
                        </span>
                      </div>
                      <pre className="text-xs font-mono text-cyan-400 overflow-x-auto p-2 leading-relaxed custom-scrollbar selection:bg-cyan-500 selection:text-black">
                        {installToken.installCommand}
                      </pre>
                    </div>
                  )}

                  <div className="pt-8 border-t border-white/5 space-y-6">
                    <div className="space-y-3">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] px-1">
                        {t.agentEndpoint}
                      </label>
                      <input
                        value={agentEndpoint}
                        onChange={(event) =>
                          setAgentEndpoint(event.target.value)
                        }
                        className="w-full bg-black/20 border border-white/5 rounded-2xl px-5 py-4 text-xs font-mono text-slate-400 focus:border-cyan-500/50 transition-all outline-none"
                        placeholder="https://eb-controller.workers.dev"
                      />
                    </div>
                    <button
                      className="w-full bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white font-black py-4 rounded-2xl border border-white/5 transition-all text-[10px] uppercase tracking-[0.3em]"
                      disabled={loading || !agentEndpoint.trim()}
                      onClick={createEndpointUpdate}
                    >
                      {t.updateAgentEndpoint}
                    </button>
                  </div>
                </div>
              </div>

              {/* Rules Form */}
              <div className="ui-glass-tech p-10 rounded-[3rem] shadow-2xl space-y-8 ui-corner-brackets">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-blue-500/10 rounded-2xl text-blue-400">
                    <FileMagnifyingGlass size={24} />
                  </div>
                  <div className="space-y-1">
                    <h2 className="text-2xl font-black tracking-tight text-white">
                      {t.aiRules}
                    </h2>
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                      {t.aiRulesHelp}
                    </p>
                  </div>
                </div>
                <textarea
                  value={rules}
                  onChange={(event) => setRules(event.target.value)}
                  className="w-full bg-black/40 border border-white/5 rounded-[2rem] p-6 text-sm text-slate-300 placeholder:text-slate-700 focus:border-cyan-500/50 transition-all outline-none resize-none min-h-[280px] leading-relaxed custom-scrollbar"
                  placeholder="System protocol constraints..."
                />
                <button
                  disabled={loading}
                  onClick={saveRules}
                  className="w-full bg-white/5 hover:bg-white/10 text-slate-300 font-black py-4 rounded-2xl border border-white/10 transition-all text-xs uppercase tracking-[0.2em]"
                >
                  {t.saveRules}
                </button>
              </div>
            </section>

            <div className="section-divider" />

            {/* Pending Confirmations Section */}
            {pendingOperations.length > 0 && (
              <section className="bg-rose-500/5 border border-rose-500/20 p-10 rounded-[3rem] shadow-2xl space-y-8 relative overflow-hidden animate-in fade-in zoom-in duration-500">
                <div className="absolute top-0 right-0 p-8 opacity-10">
                  <WarningCircle
                    size={120}
                    weight="fill"
                    className="text-rose-500"
                  />
                </div>
                <div className="flex items-center gap-4 relative z-10">
                  <div className="p-3 bg-rose-500/20 rounded-2xl text-rose-400 animate-pulse">
                    <WarningCircle size={24} />
                  </div>
                  <div className="space-y-1">
                    <h2 className="text-2xl font-black tracking-tight text-rose-400 uppercase tracking-[0.1em]">
                      {t.pendingTitle}
                    </h2>
                    <p className="text-[10px] font-black text-rose-500/70 uppercase tracking-widest">
                      {t.pendingHelp}
                    </p>
                  </div>
                </div>
                <div className="grid gap-6 relative z-10">
                  {pendingOperations.map((operation) => (
                    <div
                      className="flex items-center justify-between p-8 bg-rose-500/10 backdrop-blur border border-rose-500/20 rounded-[2rem] transition-all hover:bg-rose-500/20 group"
                      key={operation.id}
                    >
                      <div className="space-y-2">
                        <strong className="text-xl font-black tracking-tight text-rose-400 uppercase group-hover:text-rose-300 transition-colors">
                          {operation.action}
                        </strong>
                        <div className="flex items-center gap-3">
                          <span className="px-2 py-0.5 rounded bg-black/40 text-[9px] font-bold text-slate-300 uppercase tracking-wider">
                            {operation.serverName}
                          </span>
                          <span className="font-mono text-xs text-slate-400 opacity-60">
                            / {operation.command || operation.target || "NULL"}
                          </span>
                        </div>
                        <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] pt-2">
                          <Clock size={12} className="inline mr-1" />{" "}
                          SECURITY_LEASE_EXPIRES:{" "}
                          {formatDate(operation.expiresAt, language)}
                        </p>
                      </div>
                      <div className="flex gap-4">
                        <button
                          className="px-8 py-3 bg-rose-500 hover:bg-rose-400 text-white text-xs font-black uppercase tracking-[0.2em] rounded-2xl shadow-xl shadow-rose-950/40 transition-all active:scale-95"
                          disabled={loading}
                          onClick={() => confirmOperation(operation.id)}
                        >
                          {t.confirm}
                        </button>
                        <button
                          className="px-8 py-3 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white border border-white/10 rounded-2xl text-xs font-black uppercase tracking-[0.2em] transition-all active:scale-95"
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

            <div className="section-divider" />

            {/* Notification Channels */}
            <section
              className="ui-glass-tech p-10 rounded-[3.5rem] shadow-2xl space-y-12 ui-corner-brackets"
              id="notifications"
            >
              <div className="flex items-center gap-4">
                <div className="p-3 bg-purple-500/10 rounded-2xl text-purple-400">
                  <BellRinging size={24} />
                </div>
                <div className="space-y-1">
                  <h2 className="text-3xl font-black tracking-tighter text-white">
                    {t.notificationTitle}
                  </h2>
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.25em]">
                    {t.notificationHelp}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-8 items-end bg-black/20 p-8 rounded-[2.5rem] border border-white/5">
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">
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
                    className="w-full bg-white/5 border border-white/5 rounded-2xl px-5 py-4 text-sm text-white focus:border-cyan-500/50 transition-all outline-none"
                    placeholder="ALERT_GATEWAY"
                  />
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">
                    {t.type}
                  </label>
                  <div className="relative">
                    <select
                      value={notificationForm.type}
                      onChange={(event) =>
                        setNotificationForm((current) => ({
                          ...current,
                          type: event.target
                            .value as NotificationChannel["type"]
                        }))
                      }
                      className="w-full bg-white/5 border border-white/5 rounded-2xl px-5 py-4 text-sm text-white focus:border-cyan-500/50 transition-all outline-none appearance-none cursor-pointer"
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
                    <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none opacity-40">
                      <TerminalWindow size={16} />
                    </div>
                  </div>
                </div>

                {notificationForm.type !== "telegram" ? (
                  <div className="space-y-3 xl:col-span-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">
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
                      className="w-full bg-white/5 border border-white/5 rounded-2xl px-5 py-4 text-xs font-mono text-slate-400 focus:border-cyan-500/50 transition-all outline-none"
                      placeholder="https://endpoint.internal/..."
                    />
                  </div>
                ) : (
                  <>
                    <div className="space-y-3">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">
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
                        className="w-full bg-white/5 border border-white/5 rounded-2xl px-5 py-4 text-sm text-white focus:border-cyan-500/50 transition-all outline-none"
                        placeholder="TOKEN_ID"
                      />
                    </div>
                    <div className="space-y-3">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">
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
                        className="w-full bg-white/5 border border-white/5 rounded-2xl px-5 py-4 text-sm text-white focus:border-cyan-500/50 transition-all outline-none"
                        placeholder="SECURE_CHAT_ID"
                      />
                    </div>
                  </>
                )}
              </div>

              <div className="flex gap-4 max-w-2xl mx-auto">
                <button
                  disabled={loading || !notificationForm.name.trim()}
                  onClick={saveNotification}
                  className="flex-1 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 font-black py-4 rounded-2xl border border-cyan-500/20 transition-all text-[10px] uppercase tracking-[0.3em]"
                >
                  {t.saveChannel}
                </button>
                <button
                  disabled={loading || !notificationForm.name.trim()}
                  onClick={saveAndTestNotification}
                  className="flex-1 bg-white/5 hover:bg-white/10 text-slate-400 font-black py-4 rounded-2xl border border-white/10 transition-all text-[10px] uppercase tracking-[0.3em]"
                >
                  {t.saveAndTest}
                </button>
              </div>

              {notifications.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-6">
                  {notifications.map((channel) => (
                    <div
                      className="p-6 bg-black/40 border border-white/5 rounded-[2rem] flex items-center justify-between group transition-all hover:border-cyan-500/30 shadow-xl"
                      key={channel.id}
                    >
                      <div className="space-y-1">
                        <strong className="text-lg font-black tracking-tight text-white group-hover:text-cyan-400 transition-colors">
                          {channel.name}
                        </strong>
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest px-2 py-0.5 bg-white/5 rounded-full">
                            {channel.type}
                          </span>
                          {channel.type === "telegram" &&
                            channel.telegramWebhookStatus && (
                              <span className="text-[9px] font-black text-cyan-400/60 uppercase animate-pulse">
                                ACTIVE
                              </span>
                            )}
                        </div>
                      </div>
                      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all translate-x-4 group-hover:translate-x-0 duration-300">
                        <button
                          className="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-cyan-400 bg-white/5 hover:bg-cyan-500/10 border border-white/5 rounded-xl transition-all"
                          disabled={loading}
                          onClick={() => testNotification(channel.id)}
                          title={t.test}
                        >
                          <RocketLaunch size={18} />
                        </button>
                        <button
                          className="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl transition-all"
                          disabled={loading}
                          onClick={() => editNotification(channel)}
                          title={t.editChannel}
                        >
                          <IdentificationCard size={18} />
                        </button>
                        <button
                          className="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-rose-400 bg-white/5 hover:bg-rose-500/10 border border-white/5 rounded-xl transition-all"
                          disabled={loading}
                          onClick={() => deleteNotification(channel.id)}
                          title={t.delete}
                        >
                          <Trash size={18} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <div className="section-divider" />

            {/* Expandable Operation Audit */}
            <section
              className="space-y-8 pb-24 animate-stagger-4 ui-corner-brackets"
              id="audit"
            >
              <div className="flex items-center gap-4">
                <div className="p-3 bg-cyan-500/10 rounded-2xl text-cyan-400">
                  <FileMagnifyingGlass size={24} />
                </div>
                <div className="space-y-1">
                  <h2 className="text-3xl font-black tracking-tight text-white uppercase tracking-wider">
                    {t.audit}
                  </h2>
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.25em]">
                    {t.auditHelp}
                  </p>
                </div>
              </div>

              {operations.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-20 bg-slate-900/20 border border-dashed border-white/10 rounded-[3rem] text-slate-500">
                  <FileMagnifyingGlass size={48} className="opacity-10 mb-4" />
                  <p className="font-black uppercase tracking-widest text-sm">
                    {t.noOps}
                  </p>
                </div>
              ) : (
                <div className="relative group/audit">
                  <input
                    type="checkbox"
                    id="audit-expand"
                    className="peer hidden"
                  />

                  <div className="space-y-2 max-h-[220px] peer-checked:max-h-[5000px] overflow-hidden transition-all duration-700 ease-in-out relative">
                    {operations.map((operation) => (
                      <div
                        className="grid grid-cols-4 gap-6 p-5 bg-slate-900/40 border border-white/5 rounded-2xl text-[10px] font-black transition-all hover:bg-cyan-500/5 hover:border-cyan-500/20 group/row"
                        key={operation.id}
                      >
                        <span className="text-slate-500 font-mono group-row:text-slate-400 transition-colors uppercase">
                          {formatDate(operation.createdAt, language)}
                        </span>
                        <strong className="text-slate-200 uppercase tracking-wider group-row:text-cyan-400 transition-colors">
                          {operation.action}
                        </strong>
                        <em className="not-italic text-cyan-500/60 uppercase tracking-[0.2em] flex items-center gap-2">
                          <div
                            className={`w-1.5 h-1.5 rounded-full ${operation.source === "telegram" ? "bg-blue-500" : "bg-cyan-500"}`}
                          />
                          {operation.source}
                        </em>
                        <code className="text-slate-500 font-mono truncate bg-black/20 px-3 py-1 rounded-lg border border-white/5 group-row:text-slate-300 transition-colors">
                          {operation.serverId || "GLOBAL_SYSTEM"}
                        </code>
                      </div>
                    ))}

                    {/* Shadow overlay to indicate more items */}
                    <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-slate-950 to-transparent pointer-events-none peer-checked:hidden transition-opacity" />
                  </div>

                  <div className="flex justify-center mt-6">
                    <label
                      htmlFor="audit-expand"
                      className="group/btn flex items-center gap-3 px-8 py-3 bg-white/5 border border-white/10 rounded-2xl text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 hover:text-cyan-400 hover:border-cyan-400/50 cursor-pointer transition-all shadow-xl active:scale-95 select-none"
                    >
                      <span className="block group-has-[:checked]/audit:hidden">
                        View Protocol History
                      </span>
                      <span className="hidden group-has-[:checked]/audit:block">
                        Condensed View
                      </span>
                      <RocketLaunch
                        size={14}
                        className="group-hover/btn:rotate-45 transition-transform"
                      />
                    </label>
                  </div>
                </div>
              )}
            </section>
          </div>
        </div>
      </div>

      {/* Persistent Bottom AI Command Bar */}
      <footer className="fixed bottom-0 left-0 right-0 z-[60] p-6 pointer-events-none">
        <div className="max-w-5xl mx-auto pointer-events-auto flex flex-col gap-4">
          {aiOutput && (
            <div className="bg-black/90 backdrop-blur-2xl border border-cyan-500/20 rounded-[2rem] p-6 shadow-2xl animate-in slide-in-from-bottom-4 duration-500 max-h-[300px] overflow-y-auto custom-scrollbar relative">
              <button
                onClick={() => setAiOutput("")}
                className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors"
                title="Clear Output"
              >
                <Trash size={16} />
              </button>
              <p className="text-[9px] font-black uppercase tracking-[0.25em] text-cyan-500/50 mb-3 border-b border-white/5 pb-2">
                Operational Result
              </p>
              <pre className="text-sm font-medium text-slate-300 whitespace-pre-wrap leading-relaxed">
                {aiOutput}
              </pre>
            </div>
          )}

          <div className="bg-slate-900/80 backdrop-blur-3xl border border-cyan-500/30 p-2 rounded-[2rem] shadow-[0_-20px_50px_-20px_rgba(0,0,0,0.8),0_0_30px_rgba(0,255,255,0.1)] flex items-center gap-3 group focus-within:border-cyan-400 focus-within:shadow-[0_0_30px_rgba(0,255,255,0.2)] transition-all duration-500 ui-bg-scanline">
            <div className="p-3 bg-cyan-500/10 rounded-2xl text-cyan-400 shrink-0">
              <TerminalWindow size={24} />
            </div>
            <textarea
              value={aiCommand}
              onChange={(event) => setAiCommand(event.target.value)}
              className="flex-1 bg-transparent border-none py-3 px-2 text-sm text-white placeholder:text-slate-600 outline-none resize-none h-12 leading-relaxed custom-scrollbar no-scrollbar"
              placeholder="TRANSMIT_COMMAND: e.g. Check all Hong Kong nodes for status 200"
              rows={1}
            />
            <button
              disabled={loading || !aiCommand.trim()}
              onClick={runAiCommand}
              className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-black px-8 py-3 rounded-2xl shadow-lg shadow-cyan-500/20 transition-all transform active:scale-95 disabled:opacity-30 disabled:grayscale uppercase tracking-[0.2em] text-[10px] shrink-0"
            >
              {loading ? "TRANSMITTING..." : "EXECUTE"}
            </button>
          </div>
        </div>
      </footer>
    </main>
  );
}
