import { Agent, callable, routeAgentRequest } from "agents";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type ServerStatus = "pending" | "online" | "offline" | "unknown";

type ManagedServer = {
  id: string;
  name: string;
  customName?: string;
  username: string;
  host: string;
  agentUrl: string;
  token: string;
  location: string;
  tags: string[];
  status: ServerStatus;
  lastSeenAt?: string;
  lastSnapshot?: ServerSnapshot;
  createdAt: string;
  updatedAt: string;
};

type ServerSnapshot = {
  hostname?: string;
  os?: string;
  uptime?: string;
  load?: string;
  memory?: string;
  disk?: string;
  topProcesses?: string;
  collectedAt: string;
};

type InstallToken = {
  token: string;
  serverId: string;
  name?: string;
  username?: string;
  location?: string;
  expiresAt: string;
  usedAt?: string;
  createdAt: string;
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

type AgentTask = {
  id: string;
  serverId: string;
  action: string;
  target?: string;
  command?: string;
  status: "queued" | "claimed" | "completed" | "failed";
  result?: {
    stdout?: string;
    stderr?: string;
    code?: number;
  };
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
};

type NotificationChannel = {
  id: string;
  name: string;
  type: "generic_webhook" | "wecom" | "telegram";
  url?: string;
  botToken?: string;
  chatId?: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

type EdgeButlerState = {
  rules: string;
  history: ChatMessage[];
  servers: ManagedServer[];
  installTokens: InstallToken[];
  operationLogs: OperationLog[];
  pendingOperations: PendingOperation[];
  agentTasks: AgentTask[];
  notificationChannels: NotificationChannel[];
};

type ActionPlan =
  | { type: "chat"; text: string }
  | {
      type: "action";
      serverId?: string;
      serverName?: string;
      action: string;
      target?: string;
      command?: string;
      needsConfirmation?: boolean;
    };

type Env = {
  AI: Ai;
  EdgeButler: DurableObjectNamespace<EdgeButler>;
  ADMIN_PASSWORD?: string;
  ADMIN_TOKEN?: string;
  SESSION_SECRET?: string;
  TELEGRAM_BOT_TOKEN?: string;
};

const ACTIONS_REQUIRING_TARGET = new Set([
  "check_port",
  "check_process",
  "restart_service",
  "service_health",
  "shell"
]);

const MUTATING_ACTIONS = new Set(["restart_service", "shell"]);
const ACTION_ALIASES: Record<string, string> = {
  check_system_status: "server_summary",
  system_status: "server_summary",
  status: "server_summary",
  summary: "server_summary"
};

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8"
};

const SESSION_COOKIE = "eb_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12;

function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data, null, 2), {
    ...init,
    headers: { ...JSON_HEADERS, ...init?.headers }
  });
}

function nowIso() {
  return new Date().toISOString();
}

function randomId(prefix: string) {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const value = [...bytes]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `${prefix}_${value}`;
}

function safeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function base64Url(input: ArrayBuffer | string) {
  const bytes =
    typeof input === "string"
      ? new TextEncoder().encode(input)
      : new Uint8Array(input);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(input: string) {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "="
  );
  return atob(padded);
}

function getSessionSecret(env: Env) {
  return env.SESSION_SECRET || env.ADMIN_TOKEN || env.ADMIN_PASSWORD || "";
}

function isAuthConfigured(env: Env) {
  return Boolean(env.ADMIN_PASSWORD || env.ADMIN_TOKEN);
}

async function hmac(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return base64Url(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value))
  );
}

async function createSession(env: Env) {
  const payload = base64Url(
    JSON.stringify({
      exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
      nonce: randomId("nonce")
    })
  );
  const signature = await hmac(getSessionSecret(env), payload);
  return `${payload}.${signature}`;
}

async function verifySession(request: Request, env: Env) {
  if (!isAuthConfigured(env)) return true;
  const cookie = request.headers.get("Cookie") || "";
  const session = cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);

  if (!session) return false;
  const [payload, signature] = session.split(".");
  if (!payload || !signature) return false;
  if ((await hmac(getSessionSecret(env), payload)) !== signature) return false;

  try {
    const decoded = JSON.parse(fromBase64Url(payload)) as { exp?: number };
    return typeof decoded.exp === "number" && decoded.exp > Date.now() / 1000;
  } catch {
    return false;
  }
}

function sessionCookie(value: string, request: Request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_SECONDS}${secure}`;
}

function clearSessionCookie() {
  return `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}

function truncate(value: string, limit = 4000) {
  return value.length > limit
    ? `${value.slice(0, limit)}...(truncated)`
    : value;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isIp(host: string) {
  return /^[0-9.]+$/.test(host);
}

function buildAgentUrl(host: string) {
  const normalized = host.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const targetHost = isIp(normalized) ? `${normalized}.nip.io` : normalized;
  return `http://${targetHost}:8080`;
}

function inferServerName(input: {
  username?: string;
  location?: string;
  host?: string;
  customName?: string;
}) {
  if (input.customName?.trim()) return input.customName.trim();
  const user = input.username?.trim() || "root";
  const location = input.location?.trim() || "unknown";
  const host = input.host?.trim() || "pending";
  const suffix = host.split(".").slice(-2).join(".");
  return `${user}-${location}-${suffix}`;
}

async function readJson(request: Request) {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function sendTelegram(
  token: string,
  chatId: number | string,
  text: string
) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ chat_id: chatId, text })
  });
}

export class EdgeButler extends Agent<Env, EdgeButlerState> {
  initialState: EdgeButlerState = {
    rules:
      "Prefer safe built-in actions. Shell commands require user confirmation.",
    history: [],
    servers: [],
    installTokens: [],
    operationLogs: [],
    pendingOperations: [],
    agentTasks: [],
    notificationChannels: []
  };

  private get data() {
    return {
      ...this.initialState,
      ...this.state,
      servers: this.state?.servers || [],
      installTokens: this.state?.installTokens || [],
      operationLogs: this.state?.operationLogs || [],
      pendingOperations: this.state?.pendingOperations || [],
      agentTasks: this.state?.agentTasks || [],
      notificationChannels: this.state?.notificationChannels || [],
      history: this.state?.history || []
    };
  }

  private save(patch: Partial<EdgeButlerState>) {
    this.setState({ ...this.data, ...patch });
  }

  private appendLog(log: Omit<OperationLog, "id" | "createdAt">) {
    const operationLogs = [
      {
        id: randomId("op"),
        createdAt: nowIso(),
        ...log
      },
      ...this.data.operationLogs
    ].slice(0, 200);
    this.save({ operationLogs });
  }

  private async sendNotification(channel: NotificationChannel, text: string) {
    if (!channel.enabled) return;
    if (channel.type === "telegram") {
      const token = channel.botToken || this.env.TELEGRAM_BOT_TOKEN;
      if (!token || !channel.chatId) {
        throw new Error("Telegram token or chat id is missing.");
      }
      await sendTelegram(token, channel.chatId, text);
      return;
    }

    if (!channel.url) throw new Error("Webhook URL is missing.");
    if (channel.type === "wecom") {
      await fetch(channel.url, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({
          msgtype: "text",
          text: { content: text }
        })
      });
      return;
    }

    await fetch(channel.url, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ text })
    });
  }

  private async notifyAll(text: string) {
    const channels = this.data.notificationChannels.filter(
      (item) => item.enabled
    );
    await Promise.allSettled(
      channels.map((channel) => this.sendNotification(channel, text))
    );
  }

  @callable()
  async listServers() {
    return this.data.servers.map((server) => {
      const publicServer = { ...server };
      delete (publicServer as Partial<ManagedServer>).token;
      return publicServer;
    });
  }

  @callable()
  async updateServer(
    serverId: string,
    input: {
      name?: string;
      location?: string;
      tags?: string[];
      agentUrl?: string;
    }
  ) {
    const updatedAt = nowIso();
    let found = false;
    const servers = this.data.servers.map((server) => {
      if (server.id !== serverId) return server;
      found = true;
      const name = safeString(input.name) || server.name;
      return {
        ...server,
        name,
        customName: name,
        location: safeString(input.location) || server.location,
        tags: Array.isArray(input.tags) ? input.tags.map(String) : server.tags,
        agentUrl: safeString(input.agentUrl) || server.agentUrl,
        updatedAt
      };
    });
    if (!found) throw new Error("Server not found.");
    this.save({ servers });
    this.appendLog({
      source: "web",
      action: "update_server",
      serverId
    });
    return servers.find((server) => server.id === serverId);
  }

  @callable()
  async deleteServer(serverId: string) {
    const server = this.data.servers.find((item) => item.id === serverId);
    if (!server) throw new Error("Server not found.");
    this.save({
      servers: this.data.servers.filter((item) => item.id !== serverId),
      pendingOperations: this.data.pendingOperations.filter(
        (item) => item.serverId !== serverId
      )
    });
    this.appendLog({
      source: "web",
      action: "delete_server",
      serverId
    });
    return { ok: true };
  }

  @callable()
  async listOperations() {
    return this.data.operationLogs.slice(0, 100);
  }

  @callable()
  async listNotificationChannels() {
    return this.data.notificationChannels;
  }

  @callable()
  async saveNotificationChannel(input: {
    id?: string;
    name?: string;
    type?: "generic_webhook" | "wecom" | "telegram";
    url?: string;
    botToken?: string;
    chatId?: string;
    enabled?: boolean;
  }) {
    const now = nowIso();
    const id = safeString(input.id) || randomId("notify");
    const existing = this.data.notificationChannels.find(
      (item) => item.id === id
    );
    const channel: NotificationChannel = {
      id,
      name: safeString(input.name) || existing?.name || "Notification channel",
      type: input.type || existing?.type || "generic_webhook",
      url: safeString(input.url) || existing?.url,
      botToken: safeString(input.botToken) || existing?.botToken,
      chatId: safeString(input.chatId) || existing?.chatId,
      enabled: input.enabled ?? existing?.enabled ?? true,
      createdAt: existing?.createdAt || now,
      updatedAt: now
    };
    this.save({
      notificationChannels: [
        channel,
        ...this.data.notificationChannels.filter((item) => item.id !== id)
      ].slice(0, 20)
    });
    this.appendLog({
      source: "web",
      action: "save_notification_channel",
      target: channel.name
    });
    return channel;
  }

  @callable()
  async deleteNotificationChannel(channelId: string) {
    this.save({
      notificationChannels: this.data.notificationChannels.filter(
        (item) => item.id !== channelId
      )
    });
    this.appendLog({
      source: "web",
      action: "delete_notification_channel",
      target: channelId
    });
    return { ok: true };
  }

  @callable()
  async testNotificationChannel(channelId: string) {
    const channel = this.data.notificationChannels.find(
      (item) => item.id === channelId
    );
    if (!channel) throw new Error("Notification channel not found.");
    await this.sendNotification(channel, "EdgeButler test notification.");
    this.appendLog({
      source: "web",
      action: "test_notification_channel",
      target: channel.name
    });
    return { ok: true };
  }

  @callable()
  async listPendingOperations() {
    const pendingOperations = this.data.pendingOperations.filter(
      (item) => Date.parse(item.expiresAt) > Date.now()
    );
    if (pendingOperations.length !== this.data.pendingOperations.length) {
      this.save({ pendingOperations });
    }
    return pendingOperations;
  }

  @callable()
  async createInstallToken(input?: {
    name?: string;
    username?: string;
    location?: string;
    ttlMinutes?: number;
  }) {
    const ttlMinutes = Math.min(Math.max(input?.ttlMinutes || 60, 5), 1440);
    const createdAt = nowIso();
    const expiresAt = new Date(Date.now() + ttlMinutes * 60_000).toISOString();
    const installToken: InstallToken = {
      token: randomId("install"),
      serverId: randomId("srv"),
      name: input?.name?.trim() || undefined,
      username: input?.username?.trim() || undefined,
      location: input?.location?.trim() || undefined,
      createdAt,
      expiresAt
    };

    this.save({
      installTokens: [installToken, ...this.data.installTokens].slice(0, 100)
    });

    this.appendLog({
      source: "web",
      action: "create_install_token",
      serverId: installToken.serverId
    });

    return installToken;
  }

  @callable()
  async registerServer(input: {
    installToken: string;
    host: string;
    username?: string;
    hostname?: string;
    location?: string;
    agentUrl?: string;
    tags?: string[];
  }) {
    const token = safeString(input.installToken);
    const installToken = this.data.installTokens.find(
      (item) => item.token === token
    );

    if (!installToken) {
      throw new Error("Invalid install token.");
    }
    if (installToken.usedAt) {
      throw new Error("Install token has already been used.");
    }
    if (Date.parse(installToken.expiresAt) < Date.now()) {
      throw new Error("Install token has expired.");
    }

    const host = safeString(input.host);
    if (!host) throw new Error("host is required.");

    const createdAt = nowIso();
    const serverToken = randomId("agent");
    const username =
      safeString(input.username) || installToken.username || "root";
    const reportedLocation = safeString(input.location);
    const location =
      reportedLocation && reportedLocation !== "unknown"
        ? reportedLocation
        : installToken.location || "unknown";
    const name = inferServerName({
      username,
      location,
      host,
      customName: installToken.name
    });

    const server: ManagedServer = {
      id: installToken.serverId,
      name,
      customName: installToken.name,
      username,
      host,
      agentUrl: safeString(input.agentUrl) || buildAgentUrl(host),
      token: serverToken,
      location,
      tags: Array.isArray(input.tags) ? input.tags.map(String) : [],
      status: "online",
      lastSeenAt: createdAt,
      createdAt,
      updatedAt: createdAt,
      lastSnapshot: input.hostname
        ? { hostname: String(input.hostname), collectedAt: createdAt }
        : undefined
    };

    this.save({
      servers: [
        server,
        ...this.data.servers.filter((item) => item.id !== server.id)
      ],
      installTokens: this.data.installTokens.map((item) =>
        item.token === token ? { ...item, usedAt: createdAt } : item
      )
    });

    this.appendLog({
      source: "agent",
      action: "register_server",
      serverId: server.id
    });

    return { serverId: server.id, token: serverToken, name: server.name };
  }

  @callable()
  async pollAgent(input: { serverId?: string; token?: string }) {
    const server = this.authenticateAgent(input.serverId, input.token);
    const now = nowIso();
    const expiresAt = Date.now();
    const currentTasks = this.data.agentTasks.filter(
      (task) =>
        task.status === "queued" ||
        task.status === "claimed" ||
        Date.parse(task.createdAt) > Date.now() - 10 * 60_000
    );
    const task = currentTasks.find(
      (item) =>
        item.serverId === server.id &&
        item.status === "queued" &&
        Date.parse(item.expiresAt) > expiresAt
    );

    this.save({
      servers: this.data.servers.map((item) =>
        item.id === server.id
          ? {
              ...item,
              status: "online" as const,
              lastSeenAt: now,
              updatedAt: now
            }
          : item
      ),
      agentTasks: task
        ? currentTasks.map((item) =>
            item.id === task.id
              ? { ...item, status: "claimed" as const, updatedAt: now }
              : item
          )
        : currentTasks
    });

    if (!task) return { task: null, pollAfterSeconds: 5 };
    return {
      task: {
        id: task.id,
        action: task.action,
        target: task.target || "",
        command: task.command || ""
      },
      pollAfterSeconds: 1
    };
  }

  @callable()
  async reportAgentResult(input: {
    serverId?: string;
    token?: string;
    taskId?: string;
    stdout?: string;
    stderr?: string;
    code?: number;
  }) {
    const server = this.authenticateAgent(input.serverId, input.token);
    const taskId = safeString(input.taskId);
    if (!taskId) throw new Error("taskId is required.");

    const now = nowIso();
    const result = {
      stdout: truncate(safeString(input.stdout), 8000),
      stderr: truncate(safeString(input.stderr), 8000),
      code: typeof input.code === "number" ? input.code : 0
    };
    let found = false;
    const agentTasks = this.data.agentTasks.map((task) => {
      if (task.id !== taskId || task.serverId !== server.id) return task;
      found = true;
      return {
        ...task,
        status:
          result.code === 0 ? ("completed" as const) : ("failed" as const),
        result,
        updatedAt: now
      };
    });
    if (!found) throw new Error("Task not found.");

    this.save({
      agentTasks,
      servers: this.data.servers.map((item) =>
        item.id === server.id
          ? {
              ...item,
              status: "online" as const,
              lastSeenAt: now,
              updatedAt: now
            }
          : item
      )
    });

    return { ok: true };
  }

  @callable()
  async refreshServer(serverId: string) {
    const server = this.data.servers.find((item) => item.id === serverId);
    if (!server) throw new Error("Server not found.");

    const result = await this.callAgent(server, "server_summary");
    const output = truncate(result.stdout || result.stderr || "");
    const collectedAt = nowIso();
    const snapshot: ServerSnapshot = {
      collectedAt,
      ...this.parseSnapshot(output)
    };

    const servers = this.data.servers.map((item) =>
      item.id === server.id
        ? {
            ...item,
            status: result.ok ? ("online" as const) : ("offline" as const),
            lastSeenAt: result.ok ? collectedAt : item.lastSeenAt,
            lastSnapshot: snapshot,
            updatedAt: collectedAt
          }
        : item
    );

    this.save({ servers });
    if (!result.ok) {
      await this.notifyAll(
        `[EdgeButler] ${server.name} appears offline or unhealthy during refresh.`
      );
    }
    this.appendLog({
      source: "web",
      action: "refresh_server",
      serverId: server.id,
      output
    });

    return servers.find((item) => item.id === server.id);
  }

  @callable()
  async refreshAllServers() {
    const results = await Promise.allSettled(
      this.data.servers.map((server) => this.refreshServer(server.id))
    );
    return results.map((result) =>
      result.status === "fulfilled"
        ? result.value
        : { error: result.reason?.message }
    );
  }

  @callable()
  async run(command: string, source: "web" | "telegram" = "web") {
    const trimmed = command.trim();
    if (!trimmed) return "Please enter an operations command.";

    if (trimmed.startsWith("rules:")) {
      const rules = trimmed.replace("rules:", "").trim();
      this.save({ rules });
      return `[System] Rules updated: ${rules}`;
    }

    const plan = await this.plan(trimmed);
    if (plan.type === "chat") return `[EdgeButler] ${plan.text}`;
    plan.action = this.normalizeAction(plan.action);

    const server = this.resolveServer(plan.serverId, plan.serverName);
    if (!server) {
      return "Please specify the VPS to operate on. Use a server name, ID, or add a server from the web console first.";
    }

    if (
      ACTIONS_REQUIRING_TARGET.has(plan.action) &&
      !plan.target &&
      !plan.command
    ) {
      return `Please provide a target for ${plan.action}, such as a service name, port, process name, or shell command.`;
    }

    if (MUTATING_ACTIONS.has(plan.action)) {
      const pending = this.createPendingOperation(server, plan, source);
      return [
        "This operation requires confirmation before execution.",
        `Confirmation ID: ${pending.id}`,
        `Server: ${server.name}`,
        `Action: ${plan.action}`,
        plan.command
          ? `Command: ${plan.command}`
          : `Target: ${plan.target || ""}`,
        "Confirm it from the web console."
      ].join("\n");
    }

    return await this.executeOperation({
      server,
      action: plan.action,
      target: plan.target,
      command: plan.command,
      source
    });
  }

  @callable()
  async confirmOperation(operationId: string) {
    const pending = this.data.pendingOperations.find(
      (item) => item.id === operationId
    );
    if (!pending) throw new Error("Pending operation not found.");
    if (Date.parse(pending.expiresAt) < Date.now()) {
      this.save({
        pendingOperations: this.data.pendingOperations.filter(
          (item) => item.id !== operationId
        )
      });
      throw new Error("Pending operation has expired.");
    }

    const server = this.data.servers.find(
      (item) => item.id === pending.serverId
    );
    if (!server) throw new Error("Server not found.");

    this.save({
      pendingOperations: this.data.pendingOperations.filter(
        (item) => item.id !== operationId
      )
    });

    return await this.executeOperation({
      server,
      action: pending.action,
      target: pending.target,
      command: pending.command,
      source: pending.source
    });
  }

  @callable()
  async cancelOperation(operationId: string) {
    this.save({
      pendingOperations: this.data.pendingOperations.filter(
        (item) => item.id !== operationId
      )
    });
    this.appendLog({
      source: "web",
      action: "cancel_pending_operation",
      target: operationId
    });
    return { ok: true };
  }

  private createPendingOperation(
    server: ManagedServer,
    plan: Extract<ActionPlan, { type: "action" }>,
    source: "web" | "telegram"
  ) {
    const pending: PendingOperation = {
      id: randomId("pending"),
      serverId: server.id,
      serverName: server.name,
      source,
      action: plan.action,
      target: plan.target,
      command: plan.command,
      createdAt: nowIso(),
      expiresAt: new Date(Date.now() + 10 * 60_000).toISOString()
    };
    this.save({
      pendingOperations: [pending, ...this.data.pendingOperations].slice(0, 50)
    });
    this.appendLog({
      source,
      action: "create_pending_operation",
      target: pending.id,
      serverId: server.id,
      command: plan.command
    });
    void this.notifyAll(
      `[EdgeButler] Confirmation required: ${plan.action} on ${server.name}. ID: ${pending.id}`
    );
    return pending;
  }

  private async executeOperation(input: {
    server: ManagedServer;
    action: string;
    target?: string;
    command?: string;
    source: "web" | "telegram";
  }) {
    const result = await this.callAgent(
      input.server,
      input.action,
      input.target,
      input.command
    );
    const rawOutput = truncate(
      result.stdout || result.stderr || "Command completed without output."
    );
    const summary = await this.summarize(input.action, input.target, rawOutput);

    this.appendLog({
      source: input.source,
      action: input.action,
      target: input.target,
      command: input.command,
      serverId: input.server.id,
      output: rawOutput
    });

    if (MUTATING_ACTIONS.has(input.action)) {
      void this.notifyAll(
        `[EdgeButler] Executed ${input.action} on ${input.server.name}.`
      );
    }

    return [
      `[Operation] ${input.server.name} / ${input.action}`,
      "",
      summary
    ].join("\n");
  }

  private resolveServer(serverId?: string, serverName?: string) {
    const servers = this.data.servers;
    if (serverId) return servers.find((server) => server.id === serverId);
    if (serverName) {
      const query = serverName.toLowerCase();
      return servers.find(
        (server) =>
          server.name.toLowerCase().includes(query) ||
          server.customName?.toLowerCase().includes(query) ||
          server.host.includes(query)
      );
    }
    return servers.length === 1 ? servers[0] : undefined;
  }

  private async plan(command: string): Promise<ActionPlan> {
    const serverList = this.data.servers
      .map(
        (server) =>
          `- ${server.id}: ${server.name} (${server.host}, ${server.location})`
      )
      .join("\n");
    const systemPrompt = `
You are EdgeButler, an AI operations controller for Linux VPS servers.
Return JSON only. Do not use markdown.

Current user rules:
${this.data.rules}

Known servers:
${serverList || "- none"}

Actions:
- check_memory
- check_disk
- check_cpu
- check_os_version
- check_network
- check_docker
- check_logs
- check_top_processes
- check_port, requires target port
- check_process, requires target process
- restart_service, requires target service. Set needsConfirmation false unless the user explicitly says they already confirm execution.
- service_health, requires target service
- server_summary
- shell, requires command. Set needsConfirmation false unless the user explicitly says they already confirm execution.

Return chat for missing target/server.
JSON format for chat: {"type":"chat","text":"..."}
JSON format for action: {"type":"action","serverId":"...","serverName":"...","action":"...","target":"...","command":"...","needsConfirmation":false}
For mutating actions, return an action with needsConfirmation false first so the web console can create a pending confirmation. Only set needsConfirmation true when the user explicitly confirms an existing operation.
`;

    const aiResponse = await this.env.AI.run("@cf/meta/llama-3-8b-instruct", {
      messages: [
        { role: "system", content: systemPrompt },
        ...this.data.history.slice(-8),
        { role: "user", content: command }
      ]
    });

    const text = String(aiResponse.response || "")
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    try {
      const parsed = JSON.parse(text) as ActionPlan;
      return parsed;
    } catch {
      return {
        type: "chat",
        text: `AI 指令解析失败，请换一种说法。原始输出: ${text}`
      };
    }
  }

  private normalizeAction(action: string) {
    return ACTION_ALIASES[action] || action;
  }

  private async summarize(
    action: string,
    target: string | undefined,
    rawOutput: string
  ) {
    const summaryRes = await this.env.AI.run("@cf/meta/llama-3-8b-instruct", {
      messages: [
        {
          role: "user",
          content: [
            `Action: ${action}`,
            `Target: ${target || "none"}`,
            "Raw server output:",
            rawOutput,
            "Please summarize the result in concise Chinese. Mention errors or empty output directly."
          ].join("\n")
        }
      ]
    });
    return String(summaryRes.response || rawOutput);
  }

  private async callAgent(
    server: ManagedServer,
    action: string,
    target = "",
    command = ""
  ): Promise<{ ok: boolean; stdout?: string; stderr?: string; code?: number }> {
    const now = nowIso();
    const task: AgentTask = {
      id: randomId("task"),
      serverId: server.id,
      action,
      target,
      command,
      status: "queued",
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date(Date.now() + 45_000).toISOString()
    };

    this.save({
      agentTasks: [
        task,
        ...this.data.agentTasks.filter(
          (item) =>
            Date.parse(item.createdAt) > Date.now() - 10 * 60_000 ||
            item.status === "queued" ||
            item.status === "claimed"
        )
      ].slice(0, 200)
    });

    for (let attempt = 0; attempt < 45; attempt += 1) {
      await sleep(1000);
      const latest = this.data.agentTasks.find((item) => item.id === task.id);
      if (latest?.result) {
        return {
          ok: latest.result.code === undefined || latest.result.code === 0,
          ...latest.result
        };
      }
    }

    return {
      ok: false,
      stderr:
        "Timed out waiting for agent polling result. The agent may be offline or unable to reach the Worker."
    };
  }

  private authenticateAgent(serverId?: string, token?: string) {
    const id = safeString(serverId);
    const agentToken = safeString(token);
    if (!id || !agentToken) {
      throw new Error("serverId and token are required.");
    }
    const server = this.data.servers.find((item) => item.id === id);
    if (!server || server.token !== agentToken) {
      throw new Error("Invalid agent credentials.");
    }
    return server;
  }

  private parseSnapshot(output: string): Partial<ServerSnapshot> {
    const lines = output.split("\n");
    const find = (prefix: string) =>
      lines
        .find((line) => line.startsWith(`${prefix}:`))
        ?.slice(prefix.length + 1)
        .trim();
    return {
      hostname: find("hostname"),
      os: find("os"),
      uptime: find("uptime"),
      load: find("load"),
      memory: find("memory"),
      disk: find("disk")
    };
  }
}

function getController(env: Env) {
  const id = env.EdgeButler.idFromName("controller");
  return env.EdgeButler.get(id) as DurableObjectStub & {
    listServers(): Promise<unknown>;
    updateServer(serverId: string, input: unknown): Promise<unknown>;
    deleteServer(serverId: string): Promise<unknown>;
    listOperations(): Promise<unknown>;
    listPendingOperations(): Promise<unknown>;
    listNotificationChannels(): Promise<unknown>;
    saveNotificationChannel(input: unknown): Promise<unknown>;
    deleteNotificationChannel(channelId: string): Promise<unknown>;
    testNotificationChannel(channelId: string): Promise<unknown>;
    createInstallToken(input?: unknown): Promise<InstallToken>;
    registerServer(input: unknown): Promise<unknown>;
    pollAgent(input: unknown): Promise<unknown>;
    reportAgentResult(input: unknown): Promise<unknown>;
    refreshServer(serverId: string): Promise<unknown>;
    refreshAllServers(): Promise<unknown>;
    confirmOperation(operationId: string): Promise<string>;
    cancelOperation(operationId: string): Promise<unknown>;
    run(command: string, source?: "web" | "telegram"): Promise<string>;
  };
}

async function handleApi(request: Request, env: Env) {
  const url = new URL(request.url);
  const controller = getController(env);

  if (url.pathname === "/api/auth/status" && request.method === "GET") {
    return json({
      authenticated: await verifySession(request, env),
      authConfigured: isAuthConfigured(env)
    });
  }

  if (url.pathname === "/api/auth/login" && request.method === "POST") {
    const body = await readJson(request);
    const credential = safeString(body.password || body.token);
    const ok =
      credential &&
      (credential === env.ADMIN_PASSWORD || credential === env.ADMIN_TOKEN);

    if (!ok) {
      return json({ error: "Invalid admin credential." }, { status: 401 });
    }

    return json(
      { authenticated: true, authConfigured: isAuthConfigured(env) },
      {
        headers: {
          "Set-Cookie": sessionCookie(await createSession(env), request)
        }
      }
    );
  }

  if (url.pathname === "/api/auth/logout" && request.method === "POST") {
    return json(
      { authenticated: false, authConfigured: isAuthConfigured(env) },
      { headers: { "Set-Cookie": clearSessionCookie() } }
    );
  }

  if (
    !["/api/agent/register", "/api/agent/poll", "/api/agent/result"].includes(
      url.pathname
    ) &&
    !(await verifySession(request, env))
  ) {
    return json({ error: "Authentication required." }, { status: 401 });
  }

  if (url.pathname === "/api/servers" && request.method === "GET") {
    return json(await controller.listServers());
  }

  if (
    url.pathname.match(/^\/api\/servers\/[^/]+$/) &&
    request.method === "PATCH"
  ) {
    const serverId = decodeURIComponent(url.pathname.split("/")[3]);
    return json(
      await controller.updateServer(serverId, await readJson(request))
    );
  }

  if (
    url.pathname.match(/^\/api\/servers\/[^/]+$/) &&
    request.method === "DELETE"
  ) {
    const serverId = decodeURIComponent(url.pathname.split("/")[3]);
    return json(await controller.deleteServer(serverId));
  }

  if (url.pathname === "/api/operations" && request.method === "GET") {
    return json(await controller.listOperations());
  }

  if (url.pathname === "/api/pending-operations" && request.method === "GET") {
    return json(await controller.listPendingOperations());
  }

  if (url.pathname === "/api/notifications" && request.method === "GET") {
    return json(await controller.listNotificationChannels());
  }

  if (url.pathname === "/api/notifications" && request.method === "POST") {
    return json(
      await controller.saveNotificationChannel(await readJson(request))
    );
  }

  if (
    url.pathname.match(/^\/api\/notifications\/[^/]+$/) &&
    request.method === "DELETE"
  ) {
    const channelId = decodeURIComponent(url.pathname.split("/")[3]);
    return json(await controller.deleteNotificationChannel(channelId));
  }

  if (
    url.pathname.match(/^\/api\/notifications\/[^/]+\/test$/) &&
    request.method === "POST"
  ) {
    const channelId = decodeURIComponent(url.pathname.split("/")[3]);
    return json(await controller.testNotificationChannel(channelId));
  }

  if (url.pathname === "/api/install-token" && request.method === "POST") {
    const body = await readJson(request);
    const token = await controller.createInstallToken(body);
    const origin = `${url.protocol}//${url.host}`;
    return json({
      ...token,
      installCommand: `curl -fsSL "${origin}/install.sh?token=${token.token}" | sudo bash`
    });
  }

  if (url.pathname === "/api/agent/register" && request.method === "POST") {
    const body = await readJson(request);
    const cf = request.cf || {};
    const city = safeString(cf.city);
    const region = safeString(cf.region);
    const country = safeString(cf.country);
    return json(
      await controller.registerServer({
        ...body,
        location:
          safeString(body.location) ||
          [city, region, country].filter(Boolean).join("-") ||
          "unknown"
      })
    );
  }

  if (url.pathname === "/api/agent/poll" && request.method === "POST") {
    return json(await controller.pollAgent(await readJson(request)));
  }

  if (url.pathname === "/api/agent/result" && request.method === "POST") {
    return json(await controller.reportAgentResult(await readJson(request)));
  }

  if (
    url.pathname.match(/^\/api\/servers\/[^/]+\/refresh$/) &&
    request.method === "POST"
  ) {
    const serverId = decodeURIComponent(url.pathname.split("/")[3]);
    return json(await controller.refreshServer(serverId));
  }

  if (
    url.pathname === "/api/servers/refresh-all" &&
    request.method === "POST"
  ) {
    return json(await controller.refreshAllServers());
  }

  if (url.pathname === "/api/ai/run" && request.method === "POST") {
    const body = await readJson(request);
    return json({
      text: await controller.run(safeString(body.command), "web")
    });
  }

  if (
    url.pathname.match(/^\/api\/pending-operations\/[^/]+\/confirm$/) &&
    request.method === "POST"
  ) {
    const operationId = decodeURIComponent(url.pathname.split("/")[3]);
    return json({ text: await controller.confirmOperation(operationId) });
  }

  if (
    url.pathname.match(/^\/api\/pending-operations\/[^/]+\/cancel$/) &&
    request.method === "POST"
  ) {
    const operationId = decodeURIComponent(url.pathname.split("/")[3]);
    return json(await controller.cancelOperation(operationId));
  }

  return json({ error: "Not found" }, { status: 404 });
}

function installScript(origin: string, token: string) {
  return `#!/usr/bin/env bash
set -euo pipefail

ENDPOINT="${origin}"
INSTALL_TOKEN="${token}"
INSTALL_DIR="/opt/edgebutler"
SERVICE_FILE="/etc/systemd/system/edgebutler-agent.service"
RUNNER_FILE="$INSTALL_DIR/run-agent.sh"
PID_FILE="$INSTALL_DIR/agent.pid"
LOG_FILE="$INSTALL_DIR/agent.log"
ERR_LOG_FILE="$INSTALL_DIR/agent.err"
INIT_FILE="/etc/init.d/edgebutler-agent"
SUPERVISOR_CONF=""

if [ "$(id -u)" -ne 0 ]; then
  echo "Please run as root or with sudo."
  exit 1
fi

apt-get update
apt-get install -y python3 python3-venv python3-pip curl
mkdir -p "$INSTALL_DIR"

cat > "$INSTALL_DIR/agent.py" <<'PY'
${VPS_AGENT_SOURCE}
PY

cat > "$INSTALL_DIR/config.env" <<EOF
EDGEBUTLER_ENDPOINT=$ENDPOINT
EDGEBUTLER_INSTALL_TOKEN=$INSTALL_TOKEN
EDGEBUTLER_PORT=8080
EOF

python3 -m venv "$INSTALL_DIR/venv"
"$INSTALL_DIR/venv/bin/pip" install --upgrade pip flask requests

cat > "$RUNNER_FILE" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
INSTALL_DIR="/opt/edgebutler"
set -a
. "$INSTALL_DIR/config.env"
set +a
exec "$INSTALL_DIR/venv/bin/python" "$INSTALL_DIR/agent.py"
EOF
chmod +x "$RUNNER_FILE"

cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=EdgeButler Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$INSTALL_DIR
EnvironmentFile=$INSTALL_DIR/config.env
ExecStart=$RUNNER_FILE
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

if command -v systemctl >/dev/null 2>&1 && [ -d /run/systemd/system ]; then
  systemctl daemon-reload
  systemctl enable --now edgebutler-agent
  echo "EdgeButler agent installed and started with systemd."
else
  pkill -f "/opt/edgebutler/agent.py" >/dev/null 2>&1 || true

  if [ -f /etc/zo/supervisord-user.conf ] && command -v supervisorctl >/dev/null 2>&1; then
    SUPERVISOR_CONF="/etc/zo/supervisord-user.conf"
  elif [ -d /etc/supervisor/conf.d ] && command -v supervisorctl >/dev/null 2>&1; then
    SUPERVISOR_CONF="/etc/supervisor/conf.d/edgebutler-agent.conf"
    cat > "$SUPERVISOR_CONF" <<EOF
[program:edgebutler-agent]
command=$RUNNER_FILE
directory=$INSTALL_DIR
autostart=true
autorestart=true
startretries=20
startsecs=3
stopsignal=TERM
stopasgroup=true
killasgroup=true
stdout_logfile=$LOG_FILE
stderr_logfile=$ERR_LOG_FILE
stdout_logfile_maxbytes=10MB
stdout_logfile_backups=3
stderr_logfile_maxbytes=10MB
stderr_logfile_backups=3
EOF
  fi

  if [ "$SUPERVISOR_CONF" = "/etc/zo/supervisord-user.conf" ] && ! grep -q "\\[program:edgebutler-agent\\]" "$SUPERVISOR_CONF"; then
    cat >> "$SUPERVISOR_CONF" <<EOF

[program:edgebutler-agent]
command=$RUNNER_FILE
directory=$INSTALL_DIR
environment=
autostart=true
autorestart=true
stopsignal=TERM
stopasgroup=true
killasgroup=true
startretries=20
startsecs=3
stopwaitsecs=5
stdout_logfile=$LOG_FILE
stderr_logfile=$ERR_LOG_FILE
stdout_logfile_maxbytes=10MB
stdout_logfile_backups=3
stderr_logfile_maxbytes=10MB
stderr_logfile_backups=3
EOF
  fi

  if [ -n "$SUPERVISOR_CONF" ]; then
    supervisorctl -c "$SUPERVISOR_CONF" reread || true
    supervisorctl -c "$SUPERVISOR_CONF" update || true
    supervisorctl -c "$SUPERVISOR_CONF" restart edgebutler-agent || supervisorctl -c "$SUPERVISOR_CONF" start edgebutler-agent || true
    echo "EdgeButler agent installed with supervisord autorestart."
  fi

  cat > "$INIT_FILE" <<'EOF'
#!/bin/sh
### BEGIN INIT INFO
# Provides:          edgebutler-agent
# Required-Start:
# Required-Stop:
# Default-Start:     2 3 4 5
# Default-Stop:      0 1 6
# Short-Description: EdgeButler Agent
# Description:       EdgeButler outbound polling VPS agent
### END INIT INFO

name="edgebutler-agent"
cmd="/opt/edgebutler/run-agent.sh"
pid_file="/var/run/edgebutler-agent.pid"
stdout_log="/opt/edgebutler/agent.log"
stderr_log="/opt/edgebutler/agent.err"

get_pid() { cat "$pid_file"; }
is_running() { [ -f "$pid_file" ] && [ -d "/proc/$(get_pid)" ]; }

case "$1" in
  start)
    if is_running; then
      echo "Already started"
    else
      echo "Starting $name"
      cd "/opt/edgebutler"
      "$cmd" >> "$stdout_log" 2>> "$stderr_log" &
      echo $! > "$pid_file"
    fi
    ;;
  stop)
    if is_running; then
      kill "$(get_pid)" || true
      rm -f "$pid_file"
    fi
    ;;
  restart)
    $0 stop
    $0 start
    ;;
  status)
    if is_running; then echo "Running"; else echo "Stopped"; exit 1; fi
    ;;
  *)
    echo "Usage: $0 {start|stop|restart|status}"
    exit 1
    ;;
esac
exit 0
EOF
  chmod +x "$INIT_FILE"
  if command -v update-rc.d >/dev/null 2>&1; then
    update-rc.d edgebutler-agent defaults >/dev/null 2>&1 || true
  fi

  if [ -z "$SUPERVISOR_CONF" ]; then
    if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" >/dev/null 2>&1; then
      kill "$(cat "$PID_FILE")" || true
    fi
    if command -v service >/dev/null 2>&1; then
      service edgebutler-agent restart || true
    fi
    if ! [ -f "$PID_FILE" ] || ! kill -0 "$(cat "$PID_FILE")" >/dev/null 2>&1; then
      nohup "$RUNNER_FILE" > "$LOG_FILE" 2> "$ERR_LOG_FILE" &
      echo $! > "$PID_FILE"
    fi
    echo "EdgeButler agent installed with init.d fallback. PID: $(cat "$PID_FILE"), log: $LOG_FILE"
  else
    echo "EdgeButler agent lifecycle is managed by supervisord."
  fi
fi
`;
}

const VPS_AGENT_SOURCE = String.raw`from flask import Flask, request, jsonify
import os
import platform
import socket
import subprocess
import threading
import time
import requests

app = Flask(__name__)

ENDPOINT = os.environ.get("EDGEBUTLER_ENDPOINT", "").rstrip("/")
INSTALL_TOKEN = os.environ.get("EDGEBUTLER_INSTALL_TOKEN", "")
AGENT_TOKEN = os.environ.get("EDGEBUTLER_AGENT_TOKEN", "")
SERVER_ID = os.environ.get("EDGEBUTLER_SERVER_ID", "")
PORT = int(os.environ.get("EDGEBUTLER_PORT", "8080"))
ENABLE_HTTP = os.environ.get("EDGEBUTLER_ENABLE_HTTP", "0") == "1"

@app.get("/health")
def health():
    return jsonify({"ok": True, "hostname": socket.gethostname()})

ACTIONS = {
    "check_memory": "free -m",
    "check_disk": "df -h",
    "check_os_version": "cat /etc/os-release",
    "check_cpu": "top -bn1 | head -n 10",
    "check_network": "ping -c 4 8.8.8.8",
    "check_docker": "docker ps",
    "check_logs": "journalctl -n 80 --no-pager",
    "check_top_processes": "ps aux --sort=-%cpu | head -n 15",
    "check_port": "ss -lntp | grep '{target}'",
    "check_process": "ps aux | grep '{target}' | grep -v grep",
    "restart_service": "systemctl restart '{target}'",
    "service_health": "systemctl status '{target}' --no-pager; journalctl -u '{target}' -n 60 --no-pager",
    "server_summary": "printf 'hostname: '; hostname; printf 'os: '; . /etc/os-release && echo $PRETTY_NAME; printf 'uptime: '; uptime -p; printf 'load: '; cat /proc/loadavg; printf 'memory: '; free -m | awk 'NR==2{print $3\"/\"$2\" MB\"}'; printf 'disk: '; df -h / | awk 'NR==2{print $3\"/\"$2\" used, \"$5}'"
}

def run_command(cmd):
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=30)
    return {"stdout": result.stdout, "stderr": result.stderr, "code": result.returncode}

def execute_action(action, target="", command=""):
    target = str(target or "")
    command = str(command or "")
    if action == "shell":
        if not command:
            return {"stdout": "", "stderr": "command is required", "code": 2}
        return run_command(command)
    if action not in ACTIONS:
        return {"stdout": "", "stderr": f"unsupported action: {action}", "code": 2}
    template = ACTIONS[action]
    if "{target}" in template:
        if not target:
            return {"stdout": "", "stderr": "target is required", "code": 2}
        command = template.replace("{target}", target.replace("'", "'\\''"))
    else:
        command = template
    return run_command(command)

def register():
    global AGENT_TOKEN, SERVER_ID
    if not ENDPOINT:
        return
    if AGENT_TOKEN and SERVER_ID:
        return
    if not INSTALL_TOKEN:
        return
    public_ip = requests.get("https://api.ipify.org", timeout=10).text.strip()
    payload = {
        "installToken": INSTALL_TOKEN,
        "host": public_ip,
        "username": os.environ.get("USER", "root"),
        "hostname": socket.gethostname(),
        "location": "unknown",
        "agentUrl": f"http://{public_ip}.nip.io:{PORT}",
    }
    response = requests.post(f"{ENDPOINT}/api/agent/register", json=payload, timeout=20)
    response.raise_for_status()
    data = response.json()
    AGENT_TOKEN = data["token"]
    SERVER_ID = data["serverId"]
    with open("/opt/edgebutler/config.env", "a", encoding="utf-8") as file:
        file.write(f"\nEDGEBUTLER_AGENT_TOKEN={AGENT_TOKEN}\n")
        file.write(f"EDGEBUTLER_SERVER_ID={SERVER_ID}\n")

def poll_loop():
    while True:
        try:
            if not ENDPOINT or not AGENT_TOKEN or not SERVER_ID:
                time.sleep(10)
                continue
            response = requests.post(
                f"{ENDPOINT}/api/agent/poll",
                json={"serverId": SERVER_ID, "token": AGENT_TOKEN},
                timeout=30,
            )
            response.raise_for_status()
            data = response.json()
            task = data.get("task")
            if not task:
                time.sleep(int(data.get("pollAfterSeconds", 5)))
                continue
            result = execute_action(
                task.get("action", ""),
                task.get("target", ""),
                task.get("command", ""),
            )
            requests.post(
                f"{ENDPOINT}/api/agent/result",
                json={
                    "serverId": SERVER_ID,
                    "token": AGENT_TOKEN,
                    "taskId": task.get("id"),
                    **result,
                },
                timeout=30,
            ).raise_for_status()
        except Exception as exc:
            print(f"poll error: {exc}", flush=True)
            time.sleep(10)

@app.route("/api/run", methods=["POST"])
def api_run():
    data = request.get_json(force=True, silent=True) or {}
    if data.get("token") != AGENT_TOKEN:
        return jsonify({"error": "unauthorized"}), 401
    action = data.get("action", "")
    target = str(data.get("target", ""))
    command = str(data.get("command", ""))
    return jsonify(execute_action(action, target, command))

if __name__ == "__main__":
    register()
    if ENABLE_HTTP:
        threading.Thread(target=poll_loop, daemon=True).start()
        app.run(host="0.0.0.0", port=PORT)
    else:
        poll_loop()
`;

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);

    try {
      if (url.pathname.startsWith("/api/")) {
        return await handleApi(request, env);
      }

      if (url.pathname === "/install.sh" && request.method === "GET") {
        const token = safeString(url.searchParams.get("token"));
        if (!token) return new Response("missing token", { status: 400 });
        return new Response(
          installScript(`${url.protocol}//${url.host}`, token),
          {
            headers: { "Content-Type": "text/x-shellscript; charset=utf-8" }
          }
        );
      }

      if (url.pathname === "/telegram" && request.method === "POST") {
        const update = (await request.json()) as {
          message?: { chat?: { id?: number | string }; text?: string };
        };
        const chatId = update.message?.chat?.id;
        const text = update.message?.text;
        if (chatId && text && env.TELEGRAM_BOT_TOKEN) {
          const reply = await getController(env).run(text, "telegram");
          await sendTelegram(env.TELEGRAM_BOT_TOKEN, chatId, reply);
        }
        return new Response("OK");
      }

      return (
        (await routeAgentRequest(request, env)) ??
        new Response("Not Found", { status: 404 })
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return json({ error: message }, { status: 500 });
    }
  }
};
