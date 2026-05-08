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

function formatDate(value?: string) {
  if (!value) return "never";
  return new Date(value).toLocaleString();
}

function StatusPill({ status }: { status: ManagedServer["status"] }) {
  return <span className={`status status-${status}`}>{status}</span>;
}

function Snapshot({ snapshot }: { snapshot?: ServerSnapshot }) {
  if (!snapshot) return <p className="muted">No realtime snapshot yet.</p>;
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
  const [auth, setAuth] = useState<AuthStatus | null>(null);
  const [password, setPassword] = useState("");
  const [servers, setServers] = useState<ManagedServer[]>([]);
  const [operations, setOperations] = useState<OperationLog[]>([]);
  const [installToken, setInstallToken] = useState<InstallTokenResponse | null>(
    null
  );
  const [installForm, setInstallForm] = useState({
    name: "",
    username: "root",
    location: ""
  });
  const [aiCommand, setAiCommand] = useState("");
  const [aiOutput, setAiOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const onlineCount = useMemo(
    () => servers.filter((server) => server.status === "online").length,
    [servers]
  );

  async function reload() {
    const [serverData, operationData] = await Promise.all([
      api<ManagedServer[]>("/api/servers"),
      api<OperationLog[]>("/api/operations")
    ]);
    setServers(serverData);
    setOperations(operationData);
  }

  async function withLoading(task: () => Promise<void>) {
    setLoading(true);
    setError("");
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

  if (!auth?.authenticated) {
    return (
      <main className="shell auth-shell">
        <section className="hero auth-hero">
          <div>
            <p className="eyebrow">EdgeButler</p>
            <h1>Admin Login</h1>
            <p className="lead">
              Enter the admin password or token configured in Cloudflare
              secrets.
            </p>
          </div>
        </section>

        {error && <div className="alert">{error}</div>}

        <section className="panel auth-panel">
          {!auth?.authConfigured && (
            <div className="alert">
              No admin secret is configured. Set ADMIN_PASSWORD or ADMIN_TOKEN
              before production deployment.
            </div>
          )}
          <label>
            Admin credential
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
            Sign in
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <section className="hero">
        <div>
          <p className="eyebrow">EdgeButler</p>
          <h1>AI VPS Operations Console</h1>
          <p className="lead">
            Manage Linux VPS nodes through one-click agent install, on-demand
            status refresh, and AI-assisted operations.
          </p>
        </div>
        <div className="stats-card">
          <span>{servers.length}</span>
          <p>Total VPS</p>
          <strong>{onlineCount} online</strong>
          <button className="secondary small-button" onClick={logout}>
            Sign out
          </button>
        </div>
      </section>

      {error && <div className="alert">{error}</div>}

      <section className="grid two">
        <div className="panel">
          <div className="panel-header">
            <div>
              <h2>Add VPS</h2>
              <p>Generate a one-time install command for a new agent.</p>
            </div>
          </div>
          <label>
            Custom name
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
            Username
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
            Location
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
            Generate install command
          </button>
          {installToken && (
            <div className="command-box">
              <div>
                <strong>Expires</strong>
                <span>{formatDate(installToken.expiresAt)}</span>
              </div>
              <pre>{installToken.installCommand}</pre>
            </div>
          )}
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <h2>AI Operations</h2>
              <p>
                Use Chinese or English instructions. Mutating actions require
                confirmation.
              </p>
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
              Run AI command
            </button>
            <button
              className="secondary"
              disabled={loading}
              onClick={refreshAll}
            >
              Refresh all VPS
            </button>
          </div>
          {aiOutput && <pre className="output">{aiOutput}</pre>}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>VPS Fleet</h2>
            <p>Realtime checks are pulled only when you click refresh.</p>
          </div>
          <button className="secondary" disabled={loading} onClick={reload}>
            Reload
          </button>
        </div>

        {servers.length === 0 ? (
          <div className="empty">
            No VPS registered yet. Generate an install command and run it on a
            test VPS.
          </div>
        ) : (
          <div className="server-grid">
            {servers.map((server) => (
              <article className="server-card" key={server.id}>
                <div className="server-title">
                  <div>
                    <h3>{server.name}</h3>
                    <p>{server.host}</p>
                  </div>
                  <StatusPill status={server.status} />
                </div>
                <Snapshot snapshot={server.lastSnapshot} />
                <div className="server-meta">
                  <span>ID: {server.id}</span>
                  <span>Location: {server.location}</span>
                  <span>Last seen: {formatDate(server.lastSeenAt)}</span>
                </div>
                <button
                  disabled={loading}
                  onClick={() => refreshServer(server.id)}
                >
                  Refresh this VPS
                </button>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Operation Audit</h2>
            <p>Recent web, Telegram, agent, and system actions.</p>
          </div>
        </div>
        {operations.length === 0 ? (
          <div className="empty">No operations yet.</div>
        ) : (
          <div className="log-list">
            {operations.slice(0, 20).map((operation) => (
              <div className="log-row" key={operation.id}>
                <span>{formatDate(operation.createdAt)}</span>
                <strong>{operation.action}</strong>
                <em>{operation.source}</em>
                <code>{operation.serverId || "-"}</code>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
