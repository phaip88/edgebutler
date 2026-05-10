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
  telegramWebhookPath?: string;
  telegramWebhookUrl?: string;
  telegramWebhookStatus?: string;
  telegramWebhookUpdatedAt?: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

type EdgeButlerState = {
  rules: string;
  activeServerId?: string;
  mode?: "execute" | "chat";
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
  "create_directory",
  "deploy_project",
  "deploy_ttyd",
  "check_command",
  "find_file",
  "check_port",
  "check_process",
  "process_inspect",
  "stop_process",
  "restart_service",
  "service_health",
  "shell"
]);

const COMMAND_ACTIONS = new Set(["restart_service", "shell"]);
const SUPPORTED_ACTIONS = new Set([
  "check_memory",
  "check_disk",
  "check_cpu",
  "check_os_version",
  "check_network",
  "check_docker",
  "check_logs",
  "check_top_processes",
  "check_command",
  "find_file",
  "process_list",
  "process_inspect",
  "analyze_processes",
  "stop_process",
  "create_directory",
  "deploy_project",
  "deploy_ttyd",
  "check_port",
  "check_process",
  "restart_service",
  "service_health",
  "server_summary",
  "shell"
]);
const ACTION_ALIASES: Record<string, string> = {
  create_folder: "create_directory",
  mkdir: "create_directory",
  list_processes: "process_list",
  process_details: "process_inspect",
  inspect_process: "process_inspect",
  analyze_process: "analyze_processes",
  analyze_process_list: "analyze_processes",
  kill_process: "stop_process",
  check_file: "find_file",
  find_path: "find_file",
  locate_file: "find_file",
  which_command: "check_command",
  check_app: "check_command",
  check_application: "check_command",
  check_ttyd: "check_command",
  deploy_ttyd_server: "deploy_ttyd",
  deploy_github_project: "deploy_project",
  deploy_repo: "deploy_project",
  install_project: "deploy_project",
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
const AGENT_OFFLINE_AFTER_MS = 30_000;

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

function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function normalizeEndpoint(value: string) {
  const parsed = new URL(value);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Endpoint must be an HTTP or HTTPS URL.");
  }
  return parsed.origin;
}

function endpointUpdateCommand(endpoint: string) {
  const quotedEndpoint = shellQuote(endpoint);
  return [
    "set -e",
    `endpoint=${quotedEndpoint}`,
    "config=/opt/edgebutler/config.env",
    'test -f "$config"',
    "tmp=$(mktemp)",
    'awk -v ep="$endpoint" \'BEGIN{done=0} /^EDGEBUTLER_ENDPOINT=/{print "EDGEBUTLER_ENDPOINT=" ep; done=1; next} {print} END{if(!done) print "EDGEBUTLER_ENDPOINT=" ep}\' "$config" > "$tmp"',
    'cat "$tmp" > "$config"',
    'rm -f "$tmp"',
    '( sleep 3; restarted=0; if [ -f /etc/zo/supervisord-user.conf ] && command -v supervisorctl >/dev/null 2>&1; then supervisorctl -c /etc/zo/supervisord-user.conf restart edgebutler-agent && restarted=1 || true; fi; if [ "$restarted" = 0 ] && command -v systemctl >/dev/null 2>&1 && [ -d /run/systemd/system ]; then systemctl restart edgebutler-agent && restarted=1 || true; fi; if [ "$restarted" = 0 ] && command -v service >/dev/null 2>&1; then service edgebutler-agent restart && restarted=1 || true; fi; if [ "$restarted" = 0 ] && [ -x /etc/init.d/edgebutler-agent ]; then /etc/init.d/edgebutler-agent restart && restarted=1 || true; fi; if [ "$restarted" = 0 ]; then pkill -f \'^/opt/edgebutler/venv/bin/python /opt/edgebutler/agent.py$\' || true; cd /opt/edgebutler && nohup /opt/edgebutler/run-agent.sh >> /opt/edgebutler/agent.log 2>> /opt/edgebutler/agent.err & fi ) >/tmp/edgebutler-endpoint-restart.log 2>&1 &',
    'echo "Endpoint updated to $endpoint; restart scheduled."'
  ].join("; ");
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

function isServerRecentlySeen(server: ManagedServer) {
  return (
    !!server.lastSeenAt &&
    Date.now() - Date.parse(server.lastSeenAt) <= AGENT_OFFLINE_AFTER_MS
  );
}

function withDerivedServerStatus(server: ManagedServer): ManagedServer {
  if (server.status === "pending") return server;
  return {
    ...server,
    status: isServerRecentlySeen(server) ? "online" : "offline"
  };
}

function containsAnyCode(value: string, codes: number[]) {
  const set = new Set(codes);
  for (const char of value) {
    if (set.has(char.charCodeAt(0))) return true;
  }
  return false;
}

function isDeleteCommand(action: string, target = "", command = "") {
  const text = `${action} ${target} ${command}`.toLowerCase();
  return [
    /\brm\s+(-[^\s]*\s+)*[^-\s]/,
    /\brm\s+-[^\s]*r[^\s]*/,
    /\brmdir\b/,
    /\bunlink\b/,
    /\bshred\b/,
    /\bwipe\b/,
    /\bfind\b[\s\S]*\s-delete\b/,
    /\btruncate\s+-s\s*0\b/,
    /\bdd\b[\s\S]*\bof=\/dev\//,
    /\bdocker\s+(container\s+)?rm\b/,
    /\bdocker\s+(image\s+)?rmi\b/,
    /\bpodman\s+(container\s+)?rm\b/,
    /\bpodman\s+(image\s+)?rmi\b/,
    /\bkubectl\s+delete\b/,
    /\bapt(-get)?\s+(purge|remove)\b/,
    /\byum\s+remove\b/,
    /\bdnf\s+remove\b/,
    /\bsystemctl\s+(disable|mask)\b/
  ].some((pattern) => pattern.test(text));
}

function extractJsonObjects(text: string) {
  const objects: string[] = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{") {
      if (depth === 0) start = index;
      depth += 1;
      continue;
    }
    if (char === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        objects.push(text.slice(start, index + 1));
        start = -1;
      }
    }
  }
  return objects;
}

function parseActionPlanText(text: string): ActionPlan | undefined {
  const candidates = [text, ...extractJsonObjects(text)];
  const parsed = candidates
    .map((candidate) => {
      try {
        return JSON.parse(candidate) as ActionPlan;
      } catch {
        return undefined;
      }
    })
    .filter((item): item is ActionPlan => Boolean(item?.type));
  return parsed.find((item) => item.type === "action") || parsed[0];
}

function actionToAgentCommand(input: {
  action: string;
  target?: string;
  command?: string;
}): { action: string; target?: string; command?: string } {
  if (input.action !== "create_directory") return input;

  const rawPath = safeString(input.target || input.command);
  const path =
    rawPath.startsWith("/") || rawPath.startsWith("~")
      ? rawPath
      : `~/${rawPath}`;
  return {
    action: "shell",
    command: `mkdir -p -- ${shellQuote(path)} && echo "Directory created: ${path}"`
  };
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
  const response = await fetch(
    `https://api.telegram.org/bot${token}/sendMessage`,
    {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ chat_id: chatId, text })
    }
  );
  if (!response.ok) {
    throw new Error(`Telegram send failed: HTTP ${response.status}`);
  }
}

async function setTelegramWebhook(token: string, webhookUrl: string) {
  const response = await fetch(
    `https://api.telegram.org/bot${token}/setWebhook`,
    {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ url: webhookUrl })
    }
  );
  const data = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    description?: string;
  };
  if (!response.ok || !data.ok) {
    throw new Error(
      data.description ||
        `Telegram webhook setup failed: HTTP ${response.status}`
    );
  }
  return data.description || "Webhook was set.";
}

export class EdgeButler extends Agent<Env, EdgeButlerState> {
  initialState: EdgeButlerState = {
    rules:
      "All commands can execute directly. Delete/remove commands require yes/no confirmation.",
    activeServerId: undefined,
    mode: "execute",
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
      activeServerId: this.state?.activeServerId,
      mode: this.state?.mode || "execute",
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
      const publicServer = withDerivedServerStatus(server);
      delete (publicServer as Partial<ManagedServer>).token;
      return publicServer;
    });
  }

  @callable()
  async getRules() {
    return { rules: this.data.rules };
  }

  @callable()
  async updateRules(input: { rules?: string }) {
    const rules =
      safeString(input.rules) ||
      "All commands can execute directly. Delete/remove commands require yes/no confirmation.";
    this.save({ rules });
    this.appendLog({
      source: "web",
      action: "update_ai_rules"
    });
    return { rules };
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
    return this.data.notificationChannels.map((channel) => ({
      ...channel,
      botToken: channel.botToken ? "" : undefined
    }));
  }

  @callable()
  async saveNotificationChannel(input: {
    id?: string;
    name?: string;
    type?: "generic_webhook" | "wecom" | "telegram";
    url?: string;
    botToken?: string;
    chatId?: string;
    webhookOrigin?: string;
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
      telegramWebhookPath: existing?.telegramWebhookPath,
      telegramWebhookUrl: existing?.telegramWebhookUrl,
      telegramWebhookStatus: existing?.telegramWebhookStatus,
      telegramWebhookUpdatedAt: existing?.telegramWebhookUpdatedAt,
      enabled: input.enabled ?? existing?.enabled ?? true,
      createdAt: existing?.createdAt || now,
      updatedAt: now
    };
    if (channel.type === "telegram") {
      const token = channel.botToken || this.env.TELEGRAM_BOT_TOKEN;
      const origin = safeString(input.webhookOrigin);
      if (token && origin) {
        const webhookPath = channel.telegramWebhookPath || `/telegram/${id}`;
        const webhookUrl = `${origin.replace(/\/+$/, "")}${webhookPath}`;
        channel.telegramWebhookPath = webhookPath;
        channel.telegramWebhookUrl = webhookUrl;
        channel.telegramWebhookStatus = await setTelegramWebhook(
          token,
          webhookUrl
        );
        channel.telegramWebhookUpdatedAt = now;
      }
    }
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
  async testNotificationChannel(channelId: string, webhookOrigin?: string) {
    const channel = this.data.notificationChannels.find(
      (item) => item.id === channelId
    );
    if (!channel) throw new Error("Notification channel not found.");
    let telegramWebhookUrl: string | undefined;
    let telegramWebhookStatus: string | undefined;
    if (channel.type === "telegram") {
      const token = channel.botToken || this.env.TELEGRAM_BOT_TOKEN;
      const origin = safeString(webhookOrigin);
      if (token && origin) {
        const webhookPath =
          channel.telegramWebhookPath || `/telegram/${channel.id}`;
        const webhookUrl = `${origin.replace(/\/+$/, "")}${webhookPath}`;
        const status = await setTelegramWebhook(token, webhookUrl);
        telegramWebhookUrl = webhookUrl;
        telegramWebhookStatus = status;
        const updatedAt = nowIso();
        this.save({
          notificationChannels: this.data.notificationChannels.map((item) =>
            item.id === channelId
              ? {
                  ...item,
                  telegramWebhookPath: webhookPath,
                  telegramWebhookUrl: webhookUrl,
                  telegramWebhookStatus: status,
                  telegramWebhookUpdatedAt: updatedAt
                }
              : item
          )
        });
      }
    }
    await this.sendNotification(channel, "EdgeButler test notification.");
    this.appendLog({
      source: "web",
      action: "test_notification_channel",
      target: channel.name
    });
    return { ok: true, telegramWebhookUrl, telegramWebhookStatus };
  }

  @callable()
  async handleTelegramMessage(
    chatId: string | number,
    text: string,
    channelId?: string
  ) {
    const normalizedChatId = String(chatId);
    const channel = this.data.notificationChannels.find(
      (item) =>
        item.type === "telegram" &&
        item.enabled &&
        (!channelId || item.id === channelId) &&
        String(item.chatId || "") === normalizedChatId
    );
    const token = channel?.botToken || this.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      throw new Error(
        "Telegram bot token is missing. Configure a Telegram notification channel or TELEGRAM_BOT_TOKEN."
      );
    }

    const reply = await this.run(text, "telegram");
    await sendTelegram(token, normalizedChatId, reply);
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
    const reportedHost = safeString((input as { host?: string }).host);
    const reportedHostname = safeString(
      (input as { hostname?: string }).hostname
    );
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
              host: reportedHost || item.host,
              agentUrl: reportedHost
                ? buildAgentUrl(reportedHost)
                : item.agentUrl,
              status: "online" as const,
              lastSeenAt: now,
              lastSnapshot: reportedHostname
                ? {
                    ...(item.lastSnapshot || { collectedAt: now }),
                    hostname: reportedHostname,
                    collectedAt: item.lastSnapshot?.collectedAt || now
                  }
                : item.lastSnapshot,
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
  async createAgentEndpointUpdate(input: { endpoint?: string }) {
    const endpoint = normalizeEndpoint(safeString(input.endpoint));
    const onlineServers = this.data.servers.filter(isServerRecentlySeen);
    if (onlineServers.length === 0) {
      throw new Error("No online VPS is available for endpoint update.");
    }
    const pending: PendingOperation = {
      id: randomId("pending"),
      serverId: "*",
      serverName: "All online VPS",
      source: "web",
      action: "bulk_update_endpoint",
      target: endpoint,
      command: endpointUpdateCommand(endpoint),
      createdAt: nowIso(),
      expiresAt: new Date(Date.now() + 10 * 60_000).toISOString()
    };
    this.save({
      pendingOperations: [pending, ...this.data.pendingOperations].slice(0, 50)
    });
    this.appendLog({
      source: "web",
      action: "create_bulk_endpoint_update",
      target: endpoint,
      command: pending.command
    });
    return { pending, serverCount: onlineServers.length, endpoint };
  }

  @callable()
  async run(command: string, source: "web" | "telegram" = "web") {
    const trimmed = command.trim();
    if (!trimmed) return "Please enter an operations command.";

    const slash = this.handleSlashCommand(trimmed);
    if (slash) return slash;

    if (trimmed.startsWith("rules:")) {
      const rules = trimmed.replace("rules:", "").trim();
      this.save({ rules });
      return `[System] Rules updated: ${rules}`;
    }

    const platformAnswer = this.answerPlatformInventoryQuestion(trimmed);
    if (platformAnswer) return platformAnswer;

    if (this.data.mode === "chat") {
      return await this.chatOnly(trimmed);
    }

    if (!this.data.activeServerId && !this.findMentionedServer(trimmed)) {
      const platformScopeBlock = this.platformScopeBlockMessage(trimmed);
      if (platformScopeBlock) return platformScopeBlock;
    }

    let plan =
      this.planBuiltInCommand(trimmed) ||
      this.planSimpleCommand(trimmed) ||
      (await this.plan(trimmed));
    if (plan.type === "chat") {
      const fallback = this.planActiveServerFallback(trimmed);
      if (!fallback) return `[EdgeButler] ${plan.text}`;
      plan = fallback;
    }
    if (plan.type !== "action") return `[EdgeButler] ${plan.text}`;
    plan.action = this.normalizeAction(plan.action);
    if (!SUPPORTED_ACTIONS.has(plan.action)) {
      plan =
        plan.command && !isDeleteCommand("shell", "", plan.command)
          ? { ...plan, action: "shell", target: undefined }
          : await this.planShellCommand(
              trimmed,
              `Previous planner returned unsupported action: ${plan.action}`
            );
      if (plan.type !== "action") return `[EdgeButler] ${plan.text}`;
      plan.action = this.normalizeAction(plan.action);
    }

    const mentionedServer = this.findMentionedServer(trimmed);
    if (!mentionedServer && !this.data.activeServerId) {
      return this.scopeMissingMessage(plan.action, plan.target, plan.command);
    }
    const server = mentionedServer
      ? this.resolveServer(mentionedServer.id)
      : this.resolveServer(
          this.data.activeServerId || plan.serverId,
          plan.serverName
        );
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

    if (isDeleteCommand(plan.action, plan.target, plan.command)) {
      const pending = this.createPendingOperation(server, plan, source);
      return [
        "This delete/remove operation requires yes/no confirmation before execution.",
        `Confirmation ID: ${pending.id}`,
        `Server: ${server.name}`,
        `Action: ${plan.action}`,
        plan.command
          ? `Command: ${plan.command}`
          : `Target: ${plan.target || ""}`,
        "Confirm yes or no from the web console."
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
    if (pending.action === "bulk_update_endpoint") {
      this.save({
        pendingOperations: this.data.pendingOperations.filter(
          (item) => item.id !== operationId
        )
      });
      return await this.executeBulkEndpointUpdate(pending);
    }
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

  private async executeBulkEndpointUpdate(pending: PendingOperation) {
    const endpoint = safeString(pending.target);
    const command = pending.command || endpointUpdateCommand(endpoint);
    const servers = this.data.servers.filter(isServerRecentlySeen);
    const results = await Promise.allSettled(
      servers.map(async (server) => {
        const result = await this.callAgent(server, "shell", "", command);
        const output = truncate(result.stdout || result.stderr || "");
        this.appendLog({
          source: "web",
          action: "bulk_update_endpoint",
          target: endpoint,
          command,
          serverId: server.id,
          output
        });
        return { server, result, output };
      })
    );
    const lines = results.map((item, index) => {
      if (item.status === "rejected") {
        return `- ${servers[index]?.name || "unknown"}: failed - ${item.reason?.message || item.reason}`;
      }
      return `- ${item.value.server.name}: ${
        item.value.result.ok ? "updated" : "failed"
      } ${item.value.output ? `- ${item.value.output}` : ""}`;
    });
    return [`[Endpoint Update] ${endpoint}`, ...lines].join("\n");
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
      `[EdgeButler] Delete confirmation required: ${plan.action} on ${server.name}. Reply yes/no in the web console. ID: ${pending.id}`
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
    const agentInput = actionToAgentCommand(input);
    let result = await this.callAgent(
      input.server,
      agentInput.action,
      agentInput.target,
      agentInput.command
    );
    let executedCommand = input.command || agentInput.command;
    let repairedCommand = "";
    if (input.action === "shell" && result.ok === false) {
      repairedCommand = await this.repairShellCommand({
        userCommand: input.target || input.command || "",
        failedCommand: executedCommand || "",
        stdout: result.stdout || "",
        stderr: result.stderr || ""
      });
      if (repairedCommand && repairedCommand !== executedCommand) {
        result = await this.callAgent(
          input.server,
          "shell",
          "",
          repairedCommand
        );
        executedCommand = repairedCommand;
      }
    }
    const rawOutput = truncate(
      result.stdout || result.stderr || "Command completed without output."
    );
    const summary = await this.summarize(
      input.action,
      input.target,
      rawOutput,
      executedCommand,
      repairedCommand
    );

    this.appendLog({
      source: input.source,
      action: input.action,
      target: input.target,
      command: executedCommand,
      serverId: input.server.id,
      output: rawOutput
    });

    if (COMMAND_ACTIONS.has(input.action)) {
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
      const exact = servers.find(
        (server) =>
          server.name.toLowerCase() === query ||
          server.customName?.toLowerCase() === query ||
          server.id.toLowerCase() === query
      );
      if (exact) return exact;
      return servers.find(
        (server) =>
          server.name.toLowerCase().includes(query) ||
          server.customName?.toLowerCase().includes(query) ||
          server.host.includes(query)
      );
    }
    return servers.length === 1 ? servers[0] : undefined;
  }

  private findMentionedServer(command: string) {
    const lower = command.toLowerCase();
    return [...this.data.servers]
      .sort((left, right) => right.name.length - left.name.length)
      .find(
        (server) =>
          lower.includes(server.name.toLowerCase()) ||
          lower.includes(server.customName?.toLowerCase() || "\u0000") ||
          lower.includes(server.id.toLowerCase())
      );
  }

  private handleSlashCommand(command: string) {
    if (!command.startsWith("/")) return undefined;
    const [rawName, ...rest] = command.slice(1).trim().split(/\s+/);
    const name = rawName.toLowerCase();
    const arg = rest.join(" ").trim();

    if (name === "h" || name === "help") {
      const active = this.data.activeServerId
        ? this.data.servers.find(
            (server) => server.id === this.data.activeServerId
          )?.name || this.data.activeServerId
        : "none";
      return [
        "EdgeButler commands:",
        "/new <vps> - clear context and lock following commands to that VPS",
        "/new - clear context and active VPS",
        "/<vps> - switch active VPS, for example /zo or /zo2",
        "/chat - chat mode, AI only answers and does not execute",
        "/new or /<vps> - leave chat mode and return to the default executable mode",
        "/mode - show current mode and active VPS",
        "/h - show this help",
        "",
        "Examples:",
        "显示当前运行的所有进程明细",
        "分析所有进程的功能作用",
        "查询 nginx 的资源占用",
        "停止 PID 1234",
        "部署 https://github.com/tsl0922/ttyd",
        "",
        `Current mode: ${this.data.mode || "execute"}`,
        `Active VPS: ${active}`
      ].join("\n");
    }

    if (name === "new") {
      const server = arg ? this.resolveServer(undefined, arg) : undefined;
      this.save({
        history: [],
        activeServerId: server?.id,
        mode: "execute"
      });
      return server
        ? `[Context] New session. Active VPS: ${server.name}`
        : "[Context] New session. Active VPS cleared.";
    }

    if (name === "chat" || (name === "mode" && arg === "chat")) {
      this.save({ mode: "chat" });
      return "[Mode] chat mode enabled. No commands will be executed.";
    }

    if (name === "mode") {
      const active = this.data.activeServerId
        ? this.data.servers.find(
            (server) => server.id === this.data.activeServerId
          )?.name || this.data.activeServerId
        : "none";
      return `[Mode] ${this.data.mode || "execute"}; active VPS: ${active}`;
    }

    const server = this.resolveServer(undefined, name);
    if (server) {
      this.save({ activeServerId: server.id, mode: "execute" });
      return `[Context] Active VPS: ${server.name}`;
    }

    return `Unknown slash command: /${name}. Use /h for help.`;
  }

  private async chatOnly(command: string) {
    const response = await this.env.AI.run("@cf/meta/llama-3-8b-instruct", {
      messages: [
        {
          role: "system",
          content:
            "You are EdgeButler in chat mode. Answer operations questions concisely. Do not execute or propose that you executed commands."
        },
        ...this.data.history.slice(-8),
        { role: "user", content: command }
      ]
    });
    const text = String(response.response || "");
    this.save({
      history: [
        ...this.data.history,
        { role: "user" as const, content: command },
        { role: "assistant" as const, content: text }
      ].slice(-20)
    });
    return `[Chat] ${text}`;
  }

  private answerPlatformInventoryQuestion(command: string) {
    const hasChineseInventorySignal = containsAnyCode(
      command,
      [
        20960, 22810, 21738, 21517, 28165, 21015, 22312, 31163, 27491, 36830,
        38142, 22833
      ]
    );
    const mentionsFleet =
      /(vps|server|servers|agent|agents|client|clients)/i.test(command) ||
      hasChineseInventorySignal ||
      (/[\u51e0\u591a\u54ea\u540d\u6e05\u5217]/.test(command) &&
        /[\u8fde\u94fe\u5728\u79bb\u5931\u6b63]/.test(command));
    if (!mentionsFleet) return undefined;

    const asksInventory =
      hasChineseInventorySignal ||
      /[\u51e0\u591a\u54ea\u540d\u6e05\u5217\u5728\u79bb\u6b63\u8fde\u94fe\u5931]/.test(
        command
      ) ||
      /registered|connected|online|offline|list|count/i.test(command);
    if (!asksInventory) return undefined;

    const servers = this.data.servers.map(withDerivedServerStatus);
    const online = servers.filter((server) => server.status === "online");
    const offline = servers.filter((server) => server.status === "offline");
    const pending = servers.filter((server) => server.status === "pending");
    const wantsOnlineOnly =
      containsAnyCode(command, [22312, 27491, 36830, 38142]) &&
      !containsAnyCode(command, [31163, 22833]);
    const wantsOfflineOnly =
      containsAnyCode(command, [31163, 22833]) || /offline/i.test(command);
    const targetServers = wantsOfflineOnly
      ? offline
      : wantsOnlineOnly
        ? online
        : servers;
    const heading = wantsOfflineOnly
      ? `Current offline VPS: ${offline.length}`
      : wantsOnlineOnly
        ? `Current connected VPS: ${online.length}`
        : `Registered VPS: ${servers.length}; online ${online.length}; offline ${offline.length}; pending ${pending.length}`;
    const detail = targetServers.length
      ? targetServers
          .map((server) => {
            const lastSeen = server.lastSeenAt
              ? new Date(server.lastSeenAt).toISOString()
              : "never";
            return `- ${server.name}: ${server.status}; IP ${server.host || "unknown"}; location ${server.location || "unknown"}; lastSeen ${lastSeen}`;
          })
          .join("\n")
      : "- none";

    return [
      "[EdgeButler] VPS Status",
      heading,
      detail,
      "",
      /[\u8fde\u94fe]/.test(command)
        ? "Note: connected means recent agent heartbeat. No VPS shell command was executed."
        : "Note: this result comes from the EdgeButler registry and agent heartbeat. No VPS shell command was executed."
    ].join("\n");
  }

  private platformScopeBlockMessage(command: string) {
    const hasChineseVpsOperationSignal = containsAnyCode(
      command,
      [
        36827, 31243, 36127, 36733, 20869, 23384, 30913, 30424, 31471, 21475,
        26381, 21153, 26085, 24535, 25991, 20214, 37096, 32626, 23433, 35013,
        20572, 27490, 37325, 21551
      ]
    );
    const looksLikeVpsOperation =
      /process|load|memory|cpu|disk|port|service|log|file|deploy|install|stop|restart/i.test(
        command
      ) ||
      hasChineseVpsOperationSignal ||
      /[\u8fdb\u7a0b\u8d1f\u8f7d\u5185\u5b58\u78c1\u76d8\u7aef\u53e3\u670d\u52a1\u65e5\u5fd7\u6587\u4ef6\u90e8\u7f72\u5b89\u88c5\u505c\u6b62\u91cd\u542f]/.test(
        command
      );
    return looksLikeVpsOperation
      ? this.scopeMissingMessage("vps_operation")
      : undefined;
  }
  private scopeMissingMessage(action: string, target = "", command = "") {
    return [
      "[EdgeButler] Command not executed",
      "",
      "Reason: no active VPS is selected, so VPS operations are blocked in platform scope.",
      "Current scope: platform",
      `Detected action: ${action || "unknown"}`,
      target ? `Target: ${target}` : "",
      command ? `Command: ${command}` : "",
      "",
      "Choose an execution scope first:",
      "/zo",
      "/new zo",
      "or use /all <command> to run on all online VPS one by one."
    ]
      .filter(Boolean)
      .join("\n");
  }
  private planBuiltInCommand(command: string): ActionPlan | undefined {
    const lower = command.toLowerCase();
    const server = [...this.data.servers]
      .sort((left, right) => right.name.length - left.name.length)
      .find(
        (item) =>
          lower.includes(item.name.toLowerCase()) ||
          lower.includes(item.id.toLowerCase())
      );

    const processPattern = new RegExp("\\u8fdb\\u7a0b|process|pid", "i");
    const stopPattern = new RegExp(
      "\\u505c\\u6b62|\\u7ed3\\u675f|kill|stop",
      "i"
    );
    const inspectPattern = new RegExp(
      "\\u8d44\\u6e90|\\u5360\\u7528|\\u8be6\\u60c5|inspect|detail",
      "i"
    );
    const analyzePattern = new RegExp(
      "\\u5206\\u6790|\\u4f5c\\u7528|\\u7528\\u9014|analy[sz]e",
      "i"
    );
    const hasChineseSystemReadSignal = containsAnyCode(
      command,
      [
        31995, 32479, 36127, 36733, 20869, 23384, 30913, 30424, 30828, 30424,
        23481, 37327, 32593, 32476, 31471, 21475, 29256, 26412, 29366, 24577
      ]
    );
    const systemReadPattern =
      /系统|负载|内存|cpu|磁盘|硬盘|容量|网络|端口|版本|状态|load|memory|disk|network|port|os|uptime|status/i;
    if (systemReadPattern.test(command) || hasChineseSystemReadSignal) {
      return {
        type: "action",
        serverId: server?.id,
        serverName: server?.name,
        action: "server_summary",
        needsConfirmation: false
      };
    }
    const listPattern = new RegExp(
      "\\u660e\\u7ec6|\\u5217\\u8868|\\u6240\\u6709|\\u5168\\u90e8|\\u54ea\\u4e9b|\\u8fd0\\u884c|list|all|what|running",
      "i"
    );
    const filePattern = new RegExp(
      "\\u6587\\u4ef6|\\u4f4d\\u7f6e|\\u8def\\u5f84|\\u5b89\\u88c5\\u4f4d\\u7f6e|file|path|where|which|locate|find",
      "i"
    );
    const commandOnlyPattern = new RegExp(
      "\\u7ed9\\u51fa|\\u544a\\u8bc9|\\u547d\\u4ee4|show.*command|give.*command",
      "i"
    );
    const appPattern = new RegExp(
      "\\u5e94\\u7528|\\u7a0b\\u5e8f|\\u8f6f\\u4ef6|\\u662f\\u5426\\u6709|\\u6709\\u6ca1\\u6709|app|application|program|installed",
      "i"
    );

    const fileTarget =
      command.match(/\bttyd\b/i)?.[0] ||
      command.match(
        /(?:file|path|where|which|locate|find)\s+([A-Za-z0-9._-]+)/i
      )?.[1] ||
      command.match(
        /([A-Za-z0-9._-]+)\s*(?:\u7684)?\s*(?:\u6587\u4ef6|\u4f4d\u7f6e|\u8def\u5f84)/i
      )?.[1];

    if (filePattern.test(command) && commandOnlyPattern.test(command)) {
      return {
        type: "chat",
        text: [
          "查询文件位置常用命令：",
          "command -v ttyd",
          "find /usr/local/bin /usr/bin /bin /opt /etc/systemd/system -maxdepth 5 -iname '*ttyd*' 2>/dev/null | head -n 100"
        ].join("\n")
      };
    }

    if (filePattern.test(command) && fileTarget) {
      const quotedTarget = shellQuote(fileTarget);
      return {
        type: "action",
        serverId: server?.id,
        serverName: server?.name,
        action: "shell",
        command: [
          `target=${quotedTarget}`,
          'printf "Command path:\\n"',
          'command -v "$target" || true',
          'printf "\\nFile matches:\\n"',
          'find /usr/local/bin /usr/bin /bin /sbin /usr/sbin /opt /etc/systemd/system -maxdepth 6 -iname "*$target*" 2>/dev/null | head -n 100'
        ].join("; "),
        needsConfirmation: false
      };
    }

    if (appPattern.test(command) && fileTarget) {
      const quotedTarget = shellQuote(fileTarget);
      return {
        type: "action",
        serverId: server?.id,
        serverName: server?.name,
        action: "shell",
        command: [
          `target=${quotedTarget}`,
          'printf "Command path:\\n"',
          'command -v "$target" || true',
          'printf "\\nMatching files:\\n"',
          'find /usr/local/bin /usr/bin /bin /opt /etc/systemd/system -maxdepth 5 -iname "*$target*" 2>/dev/null | head -n 100',
          'printf "\\nPackage matches:\\n"',
          '(dpkg -l 2>/dev/null || rpm -qa 2>/dev/null || true) | grep -i "$target" || true'
        ].join("; "),
        needsConfirmation: false
      };
    }

    if (stopPattern.test(command) && processPattern.test(command)) {
      const target =
        command.match(/\bpid\s*[:：]?\s*(\d+)/i)?.[1] ||
        command.match(/\b(\d{2,})\b/)?.[1] ||
        command.match(/(?:\u8fdb\u7a0b|process)\s*([A-Za-z0-9._-]+)/i)?.[1];
      if (!target) return undefined;
      return {
        type: "action",
        serverId: server?.id,
        serverName: server?.name,
        action: "stop_process",
        target,
        needsConfirmation: false
      };
    }

    if (stopPattern.test(command)) {
      const target =
        command.match(/\b(\d{2,})\b/)?.[1] ||
        command.match(
          /(?:\u505c\u6b62|\u7ed3\u675f|kill|stop)\s*([A-Za-z0-9._-]+)/i
        )?.[1] ||
        command.match(/([A-Za-z0-9._-]+)\s*(?:\u7684)?\s*\u8fd0\u884c/i)?.[1];
      if (target) {
        return {
          type: "action",
          serverId: server?.id,
          serverName: server?.name,
          action: "stop_process",
          target,
          needsConfirmation: false
        };
      }
    }

    if (inspectPattern.test(command) && processPattern.test(command)) {
      const target =
        command.match(/\bpid\s*[:：]?\s*(\d+)/i)?.[1] ||
        command.match(/\b(\d{2,})\b/)?.[1] ||
        command.match(/(?:\u8fdb\u7a0b|process)\s*([A-Za-z0-9._-]+)/i)?.[1];
      if (target) {
        return {
          type: "action",
          serverId: server?.id,
          serverName: server?.name,
          action: "process_inspect",
          target,
          needsConfirmation: false
        };
      }
    }

    if (processPattern.test(command)) {
      if (analyzePattern.test(command)) {
        return {
          type: "action",
          serverId: server?.id,
          serverName: server?.name,
          action: "analyze_processes",
          needsConfirmation: false
        };
      }
      if (listPattern.test(command)) {
        return {
          type: "action",
          serverId: server?.id,
          serverName: server?.name,
          action: "process_list",
          needsConfirmation: false
        };
      }
    }

    const githubUrl = command.match(/https:\/\/github\.com\/[^\s，。)]+/i)?.[0];
    if (githubUrl && /(部署|安装|搭建|deploy|install|setup)/i.test(command)) {
      return {
        type: "action",
        serverId: server?.id,
        serverName: server?.name,
        action: githubUrl.toLowerCase().includes("tsl0922/ttyd")
          ? "deploy_ttyd"
          : "deploy_project",
        target: githubUrl,
        needsConfirmation: false
      };
    }

    const robustGithubUrl = command.match(
      /https:\/\/github\.com\/[^\s\uff0c\u3002]+/i
    )?.[0];
    const deployPattern = new RegExp(
      "\\u90e8\\u7f72|\\u5b89\\u88c5|\\u642d\\u5efa|deploy|install|setup",
      "i"
    );
    if (robustGithubUrl && deployPattern.test(command)) {
      return {
        type: "action",
        serverId: server?.id,
        serverName: server?.name,
        action: robustGithubUrl.toLowerCase().includes("tsl0922/ttyd")
          ? "deploy_ttyd"
          : "deploy_project",
        target: robustGithubUrl,
        needsConfirmation: false
      };
    }

    const createDirectory =
      new RegExp("[创創]建|新建|建立|create|make|mkdir", "i").test(command) &&
      new RegExp("文件夹|文件夾|目录|目錄|directory|folder", "i").test(command);
    if (createDirectory) {
      const match =
        command.match(
          new RegExp(
            "(?:[创創]建|新建|建立)\\s*(?:一个|1个)?\\s*([A-Za-z0-9._-]+)\\s*(?:的)?(?:文件夹|文件夾|目录|目錄)"
          )
        ) ||
        command.match(
          /(?:create|make|mkdir)\s+(?:directory|folder)?\s*([~/A-Za-z0-9._-]+)/i
        );
      const name = safeString(match?.[1]);
      if (!name) return undefined;
      const inHome = new RegExp(
        "用户目录|用戶目錄|家目录|家目錄|home|user directory",
        "i"
      ).test(command);
      return {
        type: "action",
        serverId: server?.id,
        serverName: server?.name,
        action: "create_directory",
        target:
          inHome && !name.startsWith("/") && !name.startsWith("~")
            ? `~/${name}`
            : name,
        needsConfirmation: false
      };
    }

    if (
      /(停止|结束|kill|stop)/i.test(command) &&
      /(进程|process|pid)/i.test(command)
    ) {
      const target =
        command.match(/\bpid\s*[:：]?\s*(\d+)/i)?.[1] ||
        command.match(/\b(\d{2,})\b/)?.[1] ||
        command.match(/(?:进程|process)\s*([A-Za-z0-9._-]+)/i)?.[1];
      if (!target) return undefined;
      return {
        type: "action",
        serverId: server?.id,
        serverName: server?.name,
        action: "stop_process",
        target,
        needsConfirmation: false
      };
    }

    if (
      /(资源|占用|详情|inspect|detail)/i.test(command) &&
      /(进程|process|pid)/i.test(command)
    ) {
      const target =
        command.match(/\bpid\s*[:：]?\s*(\d+)/i)?.[1] ||
        command.match(/\b(\d{2,})\b/)?.[1] ||
        command.match(/(?:进程|process)\s*([A-Za-z0-9._-]+)/i)?.[1];
      if (target) {
        return {
          type: "action",
          serverId: server?.id,
          serverName: server?.name,
          action: "process_inspect",
          target,
          needsConfirmation: false
        };
      }
    }

    if (/(进程|process)/i.test(command)) {
      if (/(分析|作用|用途|analy[sz]e)/i.test(command)) {
        return {
          type: "action",
          serverId: server?.id,
          serverName: server?.name,
          action: "analyze_processes",
          needsConfirmation: false
        };
      }
      if (/(明细|列表|所有|全部|list|all)/i.test(command)) {
        return {
          type: "action",
          serverId: server?.id,
          serverName: server?.name,
          action: "process_list",
          needsConfirmation: false
        };
      }
    }

    return undefined;
  }

  private planActiveServerFallback(command: string): ActionPlan | undefined {
    if (!this.data.activeServerId) return undefined;
    const githubUrl = command.match(
      /https:\/\/github\.com\/[^\s\uff0c\u3002]+/i
    )?.[0];
    if (githubUrl) {
      return {
        type: "action",
        serverId: this.data.activeServerId,
        action: githubUrl.toLowerCase().includes("tsl0922/ttyd")
          ? "deploy_ttyd"
          : "deploy_project",
        target: githubUrl,
        needsConfirmation: false
      };
    }

    const stopPattern = new RegExp(
      "\\u505c\\u6b62|\\u7ed3\\u675f|kill|stop",
      "i"
    );
    if (!stopPattern.test(command)) return undefined;
    const target =
      command.match(/\b(\d{2,})\b/)?.[1] ||
      command.match(
        /(?:\u505c\u6b62|\u7ed3\u675f|kill|stop)\s*([A-Za-z0-9._-]+)/i
      )?.[1] ||
      command.match(/([A-Za-z0-9._-]+)\s*(?:\u7684)?\s*\u8fd0\u884c/i)?.[1];
    if (!target) return undefined;
    return {
      type: "action",
      serverId: this.data.activeServerId,
      action: "stop_process",
      target,
      needsConfirmation: false
    };
  }

  private planSimpleCommand(command: string): ActionPlan | undefined {
    const lower = command.toLowerCase();
    const server = [...this.data.servers]
      .sort((left, right) => right.name.length - left.name.length)
      .find(
        (item) =>
          lower.includes(item.name.toLowerCase()) ||
          lower.includes(item.id.toLowerCase())
      );

    const createDirectory =
      /(创建|新建|建立|create|make|mkdir)/i.test(command) &&
      /(文件夹|目录|directory|folder)/i.test(command);
    if (!createDirectory) return undefined;

    const pathMatch =
      command.match(
        /(?:创建|新建|建立)\s*(?:一个|1个)?\s*([A-Za-z0-9._-]+)\s*(?:的)?(?:文件夹|目录)/
      ) ||
      command.match(
        /(?:create|make|mkdir)\s+(?:directory|folder)?\s*([~/A-Za-z0-9._-]+)/i
      );
    const name = safeString(pathMatch?.[1]);
    if (!name) return undefined;

    const inHome = /(用户目录|家目录|home|user directory)/i.test(command);
    return {
      type: "action",
      serverId: server?.id,
      serverName: server?.name,
      action: "create_directory",
      target:
        inHome && !name.startsWith("/") && !name.startsWith("~")
          ? `~/${name}`
          : name,
      needsConfirmation: false
    };
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
- shell, requires command. Use this for normal Linux/VPS operations.
- deploy_project, requires target GitHub repository URL. Use only for external GitHub project deployment.
- deploy_ttyd, requires target https://github.com/tsl0922/ttyd.
- stop_process, requires target PID or process keyword. Use only when the user explicitly asks to stop/kill a process.
- create_directory, requires target path. If the user says home/user directory, use ~/name.

Planning policy:
- For internal VPS administration, prefer shell. Do not invent actions such as check_file/check_ttyd/check_service unless listed above.
- Generate real Linux shell commands from the user's request. Assume Debian/Ubuntu-compatible POSIX shell unless the user says otherwise.
- Build commands with fallbacks when tools may be missing. Example: for ports, use ss if available, else netstat, else lsof, else /proc. For files/apps, use command -v plus find plus package query fallbacks.
- Use read-only commands for query/analysis requests.
- If the user asks to provide/show/give a command rather than execute it, return chat with the command text.
- Return chat only for pure conversation or if a required target is genuinely missing.
JSON format for chat: {"type":"chat","text":"..."}
JSON format for action: {"type":"action","serverId":"...","serverName":"...","action":"...","target":"...","command":"...","needsConfirmation":false}
All commands can execute directly. Deletion/removal/destructive erase commands will be intercepted by EdgeButler and require a yes/no confirmation in the web console.
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
    const parsedPlan = parseActionPlanText(text);
    if (parsedPlan) return parsedPlan;
    return await this.planShellCommand(
      command,
      `Primary planner returned invalid JSON: ${text}`
    );
  }

  private normalizeAction(action: string) {
    return ACTION_ALIASES[action] || action;
  }

  private async planShellCommand(
    userCommand: string,
    reason?: string
  ): Promise<ActionPlan> {
    const systemPrompt = [
      "You are EdgeButler's Linux shell planner.",
      "Return JSON only. Do not use markdown.",
      "Create one safe, practical /bin/sh compatible command for the user's VPS administration request.",
      "Assume Debian/Ubuntu-compatible Linux unless the user says otherwise.",
      "Use fallbacks for missing tools. Prefer read-only commands for query/analysis.",
      "For OS/distribution queries, prefer: cat /etc/os-release; uname -a.",
      "For package manager queries, use: for c in apt apt-get dpkg yum dnf apk pacman zypper rpm; do command -v $c; done.",
      "For port queries, use: (command -v ss && ss -lntup) || (command -v netstat && netstat -lntup) || (command -v lsof && lsof -i) || cat /proc/net/tcp /proc/net/tcp6.",
      "For file/application location queries, use command -v plus find across /usr/local/bin /usr/bin /bin /sbin /usr/sbin /opt /etc/systemd/system.",
      "If the user asks to provide/show/give a command instead of executing, return chat.",
      'JSON shell format: {"type":"action","action":"shell","command":"...","needsConfirmation":false}',
      'JSON chat format: {"type":"chat","text":"..."}',
      "Do not generate destructive delete/remove commands unless the user explicitly asks; EdgeButler will require confirmation."
    ].join("\n");
    const response = await this.env.AI.run("@cf/meta/llama-3-8b-instruct", {
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            reason ? `Planner note: ${reason}` : "",
            `User request: ${userCommand}`
          ]
            .filter(Boolean)
            .join("\n")
        }
      ]
    });
    const text = String(response.response || "")
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();
    const parsedPlan = parseActionPlanText(text);
    if (parsedPlan) return parsedPlan;
    return {
      type: "chat",
      text: `AI shell planner failed to return valid JSON. Raw output: ${text}`
    };
  }

  private async repairShellCommand(input: {
    userCommand: string;
    failedCommand: string;
    stdout: string;
    stderr: string;
  }) {
    if (!input.failedCommand || (!input.stderr && input.stdout)) return "";
    const response = await this.env.AI.run("@cf/meta/llama-3-8b-instruct", {
      messages: [
        {
          role: "system",
          content: [
            "You are EdgeButler's shell repair planner.",
            "Return JSON only.",
            "Given a failed Linux shell command and its error, return one corrected /bin/sh compatible command.",
            'Use fallbacks for missing tools. If there is no useful repair, return {"type":"chat","text":"..."}.',
            "If a command is not found, replace it with a portable fallback rather than repeating it.",
            "For lsb_release missing, use cat /etc/os-release and uname -a.",
            'JSON shell format: {"type":"action","action":"shell","command":"...","needsConfirmation":false}'
          ].join("\n")
        },
        {
          role: "user",
          content: [
            `User request: ${input.userCommand}`,
            `Failed command: ${input.failedCommand}`,
            "stdout:",
            input.stdout,
            "stderr:",
            input.stderr
          ].join("\n")
        }
      ]
    });
    const text = String(response.response || "")
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();
    const parsedPlan = parseActionPlanText(text);
    if (parsedPlan?.type === "action" && parsedPlan.command) {
      return parsedPlan.command;
    }
    return "";
  }

  private async summarize(
    action: string,
    target: string | undefined,
    rawOutput: string,
    command?: string,
    repairedCommand?: string
  ) {
    const summaryRes = await this.env.AI.run("@cf/meta/llama-3-8b-instruct", {
      messages: [
        {
          role: "user",
          content: [
            `Action: ${action}`,
            `Target: ${target || "none"}`,
            command ? `Executed command: ${command}` : "",
            repairedCommand ? `Auto-repaired command: ${repairedCommand}` : "",
            "Raw server output:",
            rawOutput,
            "Please summarize the result in concise Chinese. Mention the executed command when useful. Mention errors or empty output directly."
          ]
            .filter(Boolean)
            .join("\n")
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
    if (!isServerRecentlySeen(server)) {
      this.save({
        servers: this.data.servers.map((item) =>
          item.id === server.id
            ? { ...item, status: "offline" as const, updatedAt: nowIso() }
            : item
        )
      });
      return {
        ok: false,
        stderr: `Agent is offline. Last heartbeat: ${server.lastSeenAt || "never"}.`
      };
    }

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

    this.save({
      servers: this.data.servers.map((item) =>
        item.id === server.id
          ? { ...item, status: "offline" as const, updatedAt: nowIso() }
          : item
      )
    });

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
    getRules(): Promise<unknown>;
    updateRules(input: unknown): Promise<unknown>;
    updateServer(serverId: string, input: unknown): Promise<unknown>;
    deleteServer(serverId: string): Promise<unknown>;
    listOperations(): Promise<unknown>;
    listPendingOperations(): Promise<unknown>;
    listNotificationChannels(): Promise<unknown>;
    saveNotificationChannel(input: unknown): Promise<unknown>;
    deleteNotificationChannel(channelId: string): Promise<unknown>;
    testNotificationChannel(
      channelId: string,
      webhookOrigin?: string
    ): Promise<unknown>;
    handleTelegramMessage(
      chatId: string | number,
      text: string,
      channelId?: string
    ): Promise<unknown>;
    createInstallToken(input?: unknown): Promise<InstallToken>;
    registerServer(input: unknown): Promise<unknown>;
    pollAgent(input: unknown): Promise<unknown>;
    reportAgentResult(input: unknown): Promise<unknown>;
    refreshServer(serverId: string): Promise<unknown>;
    refreshAllServers(): Promise<unknown>;
    createAgentEndpointUpdate(input: unknown): Promise<unknown>;
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

  if (url.pathname === "/api/rules" && request.method === "GET") {
    return json(await controller.getRules());
  }

  if (url.pathname === "/api/rules" && request.method === "PATCH") {
    return json(await controller.updateRules(await readJson(request)));
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
    const body = await readJson(request);
    return json(
      await controller.saveNotificationChannel({
        ...body,
        webhookOrigin: `${url.protocol}//${url.host}`
      })
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
    return json(
      await controller.testNotificationChannel(
        channelId,
        `${url.protocol}//${url.host}`
      )
    );
  }

  if (url.pathname === "/api/install-token" && request.method === "POST") {
    const body = await readJson(request);
    const token = await controller.createInstallToken(body);
    const origin = `${url.protocol}//${url.host}`;
    return json({
      ...token,
      installCommand: `curl -fsSL '${origin}/install.sh?token=${token.token}' | sudo bash`
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

  if (
    url.pathname === "/api/agent-endpoint/update-all" &&
    request.method === "POST"
  ) {
    return json(
      await controller.createAgentEndpointUpdate(await readJson(request))
    );
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

function restartAgentScript() {
  return `#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="/opt/edgebutler"
RUNNER_FILE="$INSTALL_DIR/run-agent.sh"
PID_FILE="$INSTALL_DIR/agent.pid"
LOG_FILE="$INSTALL_DIR/agent.log"
ERR_LOG_FILE="$INSTALL_DIR/agent.err"
SERVICE_FILE="/etc/systemd/system/edgebutler-agent.service"
INIT_FILE="/etc/init.d/edgebutler-agent"

if [ "$(id -u)" -ne 0 ]; then
  echo "Please run as root or with sudo."
  exit 1
fi

if [ ! -x "$RUNNER_FILE" ]; then
  echo "EdgeButler runner not found: $RUNNER_FILE"
  echo "Please install the EdgeButler agent first."
  exit 2
fi

stop_existing() {
  pids=$(pgrep -f "$INSTALL_DIR/venv/bin/python $INSTALL_DIR/agent.py" || true)
  for pid in $pids; do
    [ -n "$pid" ] && kill "$pid" 2>/dev/null || true
  done
}

write_supervisor_program() {
  conf="$1"
  if ! grep -q "\\[program:edgebutler-agent\\]" "$conf" 2>/dev/null; then
    cat >> "$conf" <<EOF

[program:edgebutler-agent]
command=$RUNNER_FILE
directory=$INSTALL_DIR
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
}

if command -v systemctl >/dev/null 2>&1 && [ -d /run/systemd/system ] && [ -f "$SERVICE_FILE" ]; then
  systemctl daemon-reload
  systemctl enable edgebutler-agent >/dev/null 2>&1 || true
  systemctl restart edgebutler-agent
  systemctl --no-pager status edgebutler-agent
  exit 0
fi

if command -v supervisorctl >/dev/null 2>&1 && [ -f /etc/zo/supervisord-user.conf ]; then
  write_supervisor_program /etc/zo/supervisord-user.conf
  stop_existing
  supervisorctl -c /etc/zo/supervisord-user.conf reread || true
  supervisorctl -c /etc/zo/supervisord-user.conf update || true
  supervisorctl -c /etc/zo/supervisord-user.conf restart edgebutler-agent ||
    supervisorctl -c /etc/zo/supervisord-user.conf start edgebutler-agent
  supervisorctl -c /etc/zo/supervisord-user.conf status edgebutler-agent
  exit 0
fi

if command -v supervisorctl >/dev/null 2>&1 && [ -d /etc/supervisor/conf.d ]; then
  write_supervisor_program /etc/supervisor/conf.d/edgebutler-agent.conf
  stop_existing
  supervisorctl reread || true
  supervisorctl update || true
  supervisorctl restart edgebutler-agent || supervisorctl start edgebutler-agent
  supervisorctl status edgebutler-agent
  exit 0
fi

if command -v service >/dev/null 2>&1 && [ -x "$INIT_FILE" ]; then
  service edgebutler-agent restart || true
  if service edgebutler-agent status >/dev/null 2>&1; then
    service edgebutler-agent status
    exit 0
  fi
fi

stop_existing
nohup "$RUNNER_FILE" >> "$LOG_FILE" 2>> "$ERR_LOG_FILE" &
echo $! > "$PID_FILE"
sleep 2
if kill -0 "$(cat "$PID_FILE")" >/dev/null 2>&1; then
  echo "EdgeButler agent restarted with nohup fallback. PID: $(cat "$PID_FILE")"
  exit 0
fi

echo "Failed to restart EdgeButler agent. Check $ERR_LOG_FILE"
exit 1
`;
}

const VPS_AGENT_SOURCE = String.raw`from flask import Flask, request, jsonify
import json
import os
import re
import shutil
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
    "check_command": "printf 'Command path:\\n'; command -v '{target}' || true; printf '\\nMatching files:\\n'; find /usr/local/bin /usr/bin /bin /opt /etc/systemd/system -maxdepth 5 -iname '*{target}*' 2>/dev/null | head -n 100; printf '\\nPackage matches:\\n'; (dpkg -l 2>/dev/null || rpm -qa 2>/dev/null || true) | grep -i '{target}' || true",
    "find_file": "printf 'Command path:\\n'; command -v '{target}' || true; printf '\\nFile matches:\\n'; find /usr/local/bin /usr/bin /bin /sbin /usr/sbin /opt /etc/systemd/system -maxdepth 6 -iname '*{target}*' 2>/dev/null | head -n 100",
    "process_list": "ps -eo pid,ppid,user,stat,pcpu,pmem,etime,comm,args --sort=-pcpu | head -n 100",
    "analyze_processes": "printf 'Top CPU/memory processes:\\n'; ps -eo pid,ppid,user,stat,pcpu,pmem,etime,comm,args --sort=-pcpu | head -n 40; printf '\\nRunning services:\\n'; systemctl list-units --type=service --state=running --no-pager 2>/dev/null | head -n 80 || true; printf '\\nListening ports:\\n'; ss -lntup 2>/dev/null | head -n 80 || true",
    "check_port": "ss -lntp | grep '{target}'",
    "check_process": "ps aux | grep '{target}' | grep -v grep",
    "process_inspect": "printf 'Matched processes:\\n'; ps aux | grep '{target}' | grep -v grep; printf '\\nResource details:\\n'; pid=$(pgrep -f '{target}' | head -n 1); if [ -n \"$pid\" ]; then ps -p \"$pid\" -o pid,ppid,user,stat,pcpu,pmem,etime,comm,args; cat /proc/$pid/status 2>/dev/null | head -n 40; fi",
    "create_directory": "mkdir -p -- '{target}' && echo 'Directory created: {target}'",
    "restart_service": "systemctl restart '{target}'",
    "service_health": "systemctl status '{target}' --no-pager; journalctl -u '{target}' -n 60 --no-pager",
    "server_summary": "printf 'hostname: '; hostname; printf 'os: '; . /etc/os-release && echo $PRETTY_NAME; printf 'uptime: '; uptime -p; printf 'load: '; cat /proc/loadavg; printf 'memory: '; free -m | awk 'NR==2{print $3\"/\"$2\" MB\"}'; printf 'disk: '; df -h / | awk 'NR==2{print $3\"/\"$2\" used, \"$5}'"
}

def run_command(cmd):
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=30)
    return {"stdout": result.stdout, "stderr": result.stderr, "code": result.returncode}

def shell_quote(value):
    return "'" + str(value).replace("'", "'\\''") + "'"

def stop_process(target):
    target = str(target or "").strip()
    if not target:
        return {"stdout": "", "stderr": "target is required", "code": 2}
    current_pid = os.getpid()
    candidates = []
    if target.isdigit():
        candidates = [int(target)]
    else:
        ps = subprocess.run(["ps", "-eo", "pid=,args="], capture_output=True, text=True, timeout=30)
        for line in ps.stdout.splitlines():
            parts = line.strip().split(None, 1)
            if len(parts) != 2:
                continue
            pid = int(parts[0])
            args = parts[1]
            if pid == current_pid or "edgebutler/agent.py" in args:
                continue
            if target.lower() in args.lower():
                candidates.append(pid)
    if not candidates:
        return {"stdout": "", "stderr": f"no process matched: {target}", "code": 1}
    stopped = []
    errors = []
    for pid in sorted(set(candidates)):
        if pid in (0, 1, current_pid):
            continue
        try:
            os.kill(pid, 15)
            stopped.append(pid)
        except ProcessLookupError:
            continue
        except PermissionError as exc:
            errors.append(f"{pid}: {exc}")
    if not stopped and errors:
        return {"stdout": "", "stderr": "\\n".join(errors), "code": 1}
    return {
        "stdout": f"Stop signal sent to PID(s): {', '.join(map(str, stopped))}\\nTarget: {target}",
        "stderr": "\\n".join(errors),
        "code": 0 if stopped else 1,
    }

def execute_action(action, target="", command=""):
    target = str(target or "")
    command = str(command or "")
    if action == "shell":
        if not command:
            return {"stdout": "", "stderr": "command is required", "code": 2}
        return run_command(command)
    if action == "create_directory":
        if not target:
            return {"stdout": "", "stderr": "target is required", "code": 2}
        path = target
        if not path.startswith(("/", "~")):
            path = os.path.join(os.path.expanduser("~"), path)
        return run_command(f"mkdir -p -- {shell_quote(path)} && echo {shell_quote('Directory created: ' + path)}")
    if action == "stop_process":
        return stop_process(target)
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

def safe_public_ip():
    try:
        return requests.get("https://api.ipify.org", timeout=10).text.strip()
    except Exception:
        return ""

def poll_loop():
    while True:
        try:
            if not ENDPOINT or not AGENT_TOKEN or not SERVER_ID:
                time.sleep(10)
                continue
            response = requests.post(
                f"{ENDPOINT}/api/agent/poll",
                json={
                    "serverId": SERVER_ID,
                    "token": AGENT_TOKEN,
                    "host": safe_public_ip(),
                    "hostname": socket.gethostname(),
                },
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

      if (url.pathname === "/restart-agent.sh" && request.method === "GET") {
        return new Response(restartAgentScript(), {
          headers: { "Content-Type": "text/x-shellscript; charset=utf-8" }
        });
      }

      if (
        (url.pathname === "/telegram" ||
          url.pathname.match(/^\/telegram\/[^/]+$/)) &&
        request.method === "POST"
      ) {
        const channelId = url.pathname.startsWith("/telegram/")
          ? decodeURIComponent(url.pathname.split("/")[2])
          : undefined;
        const update = (await request.json()) as {
          message?: { chat?: { id?: number | string }; text?: string };
        };
        const chatId = update.message?.chat?.id;
        const text = update.message?.text;
        if (chatId && text) {
          await getController(env).handleTelegramMessage(
            chatId,
            text,
            channelId
          );
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
