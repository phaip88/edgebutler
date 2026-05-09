import { useEffect, useMemo, useState } from "react";

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
      "Ask for diagnostics or operations. Mutating actions require web confirmation.",
    aiRules: "AI System Rules",
    aiRulesHelp:
      "These rules are injected into the AI planning prompt for every web and Telegram command.",
    saveRules: "Save rules",
    rulesSaved: "AI system rules saved.",
    runAi: "Run AI command",
    pendingTitle: "Pending Confirmations",
    pendingHelp: "Mutating operations expire after 10 minutes.",
    confirm: "Confirm",
    cancel: "Cancel",
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
    zh: { pending: "待安装", online: "在线", offline: "离线", unknown: "未知" }
  };
  return (
    <span className={`status status-${status}`}>
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
  if (!snapshot) return <p className="muted">{t.noSnapshot}</p>;
  const items = [
    ["Host", snapshot.hostname],
    ["OS", snapshot.os],
    ["Uptime", snapshot.uptime],
    ["Load", snapshot.load],
    ["Memory", snapshot.memory],
    ["Disk", snapshot.disk]
  ];

  return (
    <dl className="snapshot">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value || "-"}</dd>
        </div>
      ))}
    </dl>
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
      <main className="shell auth-shell">
        <div className="language-switch floating-switch">
          <button
            className={language === "zh" ? "active" : "secondary"}
            onClick={() => changeLanguage("zh")}
          >
            中文
          </button>
          <button
            className={language === "en" ? "active" : "secondary"}
            onClick={() => changeLanguage("en")}
          >
            EN
          </button>
        </div>
        <section className="hero auth-hero">
          <div>
            <p className="eyebrow">EdgeButler</p>
            <h1>{t.loginTitle}</h1>
            <p className="lead">{t.loginLead}</p>
          </div>
        </section>

        {error && <div className="alert">{error}</div>}

        <section className="panel auth-panel">
          {!auth?.authConfigured && <div className="alert">{t.noSecret}</div>}
          <label>
            {t.credential}
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") login();
              }}
              placeholder="ADMIN_PASSWORD or ADMIN_TOKEN"
            />
          </label>
          <button disabled={loading || !password.trim()} onClick={login}>
            {t.signIn}
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <div className="ops-layout">
        <aside className="nav-rail">
          <div className="brand-mark">EB</div>
          <a href="#fleet">{t.fleet}</a>
          <a href="#ai">{t.aiOps}</a>
          <a href="#install">{t.addVps}</a>
          <a href="#notifications">{t.notificationTitle}</a>
          <a href="#audit">{t.audit}</a>
        </aside>
        <div className="workspace">
          <header className="topbar">
            <div>
              <p className="eyebrow">EdgeButler / VPS Ops</p>
              <h1>{t.title}</h1>
              <p className="lead">{t.lead}</p>
              <div className="topbar-meta">
                <span>Agent polling mode</span>
                <span>
                  {t.lastSeen}: {formatDate(newestSnapshot, language)}
                </span>
              </div>
            </div>
            <div className="topbar-actions">
              <div className="language-switch">
                <button
                  className={language === "zh" ? "active" : "secondary"}
                  onClick={() => changeLanguage("zh")}
                >
                  中文
                </button>
                <button
                  className={language === "en" ? "active" : "secondary"}
                  onClick={() => changeLanguage("en")}
                >
                  EN
                </button>
              </div>
              <button className="secondary" onClick={logout}>
                {t.signOut}
              </button>
            </div>
          </header>

          <section className="metric-grid">
            <div className="metric-card">
              <span>{servers.length}</span>
              <p>{t.totalVps}</p>
            </div>
            <div className="metric-card good">
              <span>{onlineCount}</span>
              <p>{t.online}</p>
            </div>
            <div className="metric-card danger">
              <span>{offlineCount}</span>
              <p>Offline</p>
            </div>
            <div className="metric-card warn">
              <span>{pendingOperations.length}</span>
              <p>{t.pending}</p>
            </div>
            <div className="metric-card">
              <span>{notifications.length}</span>
              <p>{t.notifications}</p>
            </div>
          </section>

          {error && <div className="alert">{error}</div>}
          {notice && <div className="notice">{notice}</div>}

          <section className="panel fleet-panel" id="fleet">
            <div className="panel-header">
              <div>
                <h2>{t.fleet}</h2>
                <p>{t.fleetHelp}</p>
              </div>
              <div className="button-row">
                <button
                  className="secondary"
                  disabled={loading}
                  onClick={reload}
                >
                  {t.reload}
                </button>
                <button
                  className="secondary"
                  disabled={loading}
                  onClick={refreshAll}
                >
                  {t.refreshAll}
                </button>
              </div>
            </div>

            {servers.length === 0 ? (
              <div className="empty">{t.noVps}</div>
            ) : (
              <div className="server-grid">
                {servers.map((server) => (
                  <article className="server-card" key={server.id}>
                    <div className="server-title">
                      <div>
                        <h3>{server.name}</h3>
                        <p>{server.host}</p>
                      </div>
                      <StatusPill status={server.status} language={language} />
                    </div>
                    <Snapshot
                      snapshot={server.lastSnapshot}
                      language={language}
                    />
                    <div className="server-meta">
                      <span>ID: {server.id}</span>
                      <span>
                        {t.location}: {server.location}
                      </span>
                      <span>
                        {t.lastSeen}: {formatDate(server.lastSeenAt, language)}
                      </span>
                    </div>
                    <div className="button-row">
                      <button
                        disabled={loading}
                        onClick={() => refreshServer(server.id)}
                      >
                        {t.refreshOne}
                      </button>
                      <button
                        className="secondary"
                        disabled={loading}
                        onClick={() => editServer(server)}
                      >
                        {t.edit}
                      </button>
                      <button
                        className="secondary"
                        disabled={loading}
                        onClick={() => deleteServer(server)}
                      >
                        {t.delete}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="grid two">
            <div className="panel" id="install">
              <div className="panel-header">
                <div>
                  <h2>{t.addVps}</h2>
                  <p>{t.addVpsHelp}</p>
                </div>
              </div>
              <label>
                {t.customName}
                <input
                  value={installForm.name}
                  onChange={(event) =>
                    setInstallForm((current) => ({
                      ...current,
                      name: event.target.value
                    }))
                  }
                  placeholder="Hong Kong proxy 01"
                />
              </label>
              <label>
                {t.username}
                <input
                  value={installForm.username}
                  onChange={(event) =>
                    setInstallForm((current) => ({
                      ...current,
                      username: event.target.value
                    }))
                  }
                  placeholder="root"
                />
              </label>
              <label>
                {t.location}
                <input
                  value={installForm.location}
                  onChange={(event) =>
                    setInstallForm((current) => ({
                      ...current,
                      location: event.target.value
                    }))
                  }
                  placeholder="Hong Kong"
                />
              </label>
              <button disabled={loading} onClick={createInstallToken}>
                {t.generateInstall}
              </button>
              {installToken && (
                <div className="command-box">
                  <div>
                    <strong>{t.expires}</strong>
                    <span>{formatDate(installToken.expiresAt, language)}</span>
                  </div>
                  <pre>{installToken.installCommand}</pre>
                </div>
              )}
            </div>

            <div className="panel" id="ai">
              <div className="panel-header">
                <div>
                  <h2>{t.aiOps}</h2>
                  <p>{t.aiOpsHelp}</p>
                </div>
              </div>
              <textarea
                value={aiCommand}
                onChange={(event) => setAiCommand(event.target.value)}
                placeholder="Show nginx service health on Hong Kong VPS"
              />
              <div className="button-row">
                <button
                  disabled={loading || !aiCommand.trim()}
                  onClick={runAiCommand}
                >
                  {t.runAi}
                </button>
                <button
                  className="secondary"
                  disabled={loading}
                  onClick={refreshAll}
                >
                  {t.refreshAll}
                </button>
              </div>
              {aiOutput && <pre className="output">{aiOutput}</pre>}
            </div>

            <div className="panel">
              <div className="panel-header">
                <div>
                  <h2>{t.aiRules}</h2>
                  <p>{t.aiRulesHelp}</p>
                </div>
              </div>
              <textarea
                value={rules}
                onChange={(event) => setRules(event.target.value)}
                placeholder="Prefer safe built-in actions. Shell commands require user confirmation."
              />
              <div className="button-row">
                <button disabled={loading} onClick={saveRules}>
                  {t.saveRules}
                </button>
              </div>
            </div>
          </section>

          {pendingOperations.length > 0 && (
            <section className="panel danger-panel">
              <div className="panel-header">
                <div>
                  <h2>{t.pendingTitle}</h2>
                  <p>{t.pendingHelp}</p>
                </div>
              </div>
              <div className="pending-list">
                {pendingOperations.map((operation) => (
                  <div className="pending-row" key={operation.id}>
                    <div>
                      <strong>{operation.action}</strong>
                      <p>
                        {operation.serverName} /{" "}
                        {operation.command || operation.target || "no target"}
                      </p>
                      <span>
                        {t.expires}: {formatDate(operation.expiresAt, language)}
                      </span>
                    </div>
                    <div className="button-row">
                      <button
                        disabled={loading}
                        onClick={() => confirmOperation(operation.id)}
                      >
                        {t.confirm}
                      </button>
                      <button
                        className="secondary"
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

          <section className="panel" id="notifications">
            <div className="panel-header">
              <div>
                <h2>{t.notificationTitle}</h2>
                <p>{t.notificationHelp}</p>
              </div>
            </div>
            <div className="notification-form">
              <label>
                {t.name}
                <input
                  value={notificationForm.name}
                  onChange={(event) =>
                    setNotificationForm((current) => ({
                      ...current,
                      name: event.target.value
                    }))
                  }
                  placeholder="Ops WeCom"
                />
              </label>
              <label>
                {t.type}
                <select
                  value={notificationForm.type}
                  onChange={(event) =>
                    setNotificationForm((current) => ({
                      ...current,
                      type: event.target.value as NotificationChannel["type"]
                    }))
                  }
                >
                  <option value="wecom">Enterprise WeChat</option>
                  <option value="telegram">Telegram</option>
                  <option value="generic_webhook">Generic webhook</option>
                </select>
              </label>
              {notificationForm.type !== "telegram" && (
                <label>
                  {t.webhookUrl}
                  <input
                    value={notificationForm.url}
                    onChange={(event) =>
                      setNotificationForm((current) => ({
                        ...current,
                        url: event.target.value
                      }))
                    }
                    placeholder="https://..."
                  />
                </label>
              )}
              {notificationForm.type === "telegram" && (
                <label>
                  {t.botToken}
                  <input
                    type="password"
                    value={notificationForm.botToken}
                    onChange={(event) =>
                      setNotificationForm((current) => ({
                        ...current,
                        botToken: event.target.value
                      }))
                    }
                    placeholder="123456:ABC..."
                  />
                </label>
              )}
              <label>
                {t.chatId}
                <input
                  value={notificationForm.chatId}
                  onChange={(event) =>
                    setNotificationForm((current) => ({
                      ...current,
                      chatId: event.target.value
                    }))
                  }
                  placeholder="Only for Telegram"
                />
              </label>
              <button
                disabled={loading || !notificationForm.name.trim()}
                onClick={saveNotification}
              >
                {t.saveChannel}
              </button>
              <button
                className="secondary"
                disabled={loading || !notificationForm.name.trim()}
                onClick={saveAndTestNotification}
              >
                {t.saveAndTest}
              </button>
            </div>
            {notifications.length > 0 && (
              <div className="channel-list">
                {notifications.map((channel) => (
                  <div className="channel-row" key={channel.id}>
                    <div>
                      <strong>{channel.name}</strong>
                      <p>{channel.type}</p>
                      {channel.type === "telegram" &&
                        channel.telegramWebhookUrl && (
                          <p className="muted">
                            Webhook: {channel.telegramWebhookUrl}
                          </p>
                        )}
                      {channel.type === "telegram" &&
                        channel.telegramWebhookStatus && (
                          <p className="muted">
                            {channel.telegramWebhookStatus}
                          </p>
                        )}
                    </div>
                    <div className="button-row">
                      <button
                        className="secondary"
                        disabled={loading}
                        onClick={() => testNotification(channel.id)}
                      >
                        {t.test}
                      </button>
                      <button
                        className="secondary"
                        disabled={loading}
                        onClick={() => editNotification(channel)}
                      >
                        {t.editChannel}
                      </button>
                      <button
                        className="secondary"
                        disabled={loading}
                        onClick={() => deleteNotification(channel.id)}
                      >
                        {t.delete}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="panel" id="audit">
            <div className="panel-header">
              <div>
                <h2>{t.audit}</h2>
                <p>{t.auditHelp}</p>
              </div>
            </div>
            {operations.length === 0 ? (
              <div className="empty">{t.noOps}</div>
            ) : (
              <div className="log-list">
                {operations.slice(0, 20).map((operation) => (
                  <div className="log-row" key={operation.id}>
                    <span>{formatDate(operation.createdAt, language)}</span>
                    <strong>{operation.action}</strong>
                    <em>{operation.source}</em>
                    <code>{operation.serverId || "-"}</code>
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
