from flask import Flask, jsonify, request
import json
import os
import re
import shutil
import socket
import subprocess
import threading
import time

try:
    import requests
except ImportError:
    requests = None

app = Flask(__name__)

ENDPOINT = os.environ.get("EDGEBUTLER_ENDPOINT", "").rstrip("/")
INSTALL_TOKEN = os.environ.get("EDGEBUTLER_INSTALL_TOKEN", "")
AGENT_TOKEN = os.environ.get("EDGEBUTLER_AGENT_TOKEN", "")
SERVER_ID = os.environ.get("EDGEBUTLER_SERVER_ID", "")
PORT = int(os.environ.get("EDGEBUTLER_PORT", "8080"))
ENABLE_HTTP = os.environ.get("EDGEBUTLER_ENABLE_HTTP", "0") == "1"

ACTIONS = {
    "check_memory": "free -m",
    "check_disk": "df -h",
    "check_os_version": "cat /etc/os-release",
    "check_cpu": "top -bn1 | head -n 10",
    "check_network": "ping -c 4 8.8.8.8",
    "check_docker": "docker ps",
    "check_logs": "journalctl -n 80 --no-pager",
    "check_top_processes": "ps aux --sort=-%cpu | head -n 15",
    "process_list": "ps -eo pid,ppid,user,stat,pcpu,pmem,etime,comm,args --sort=-pcpu | head -n 100",
    "analyze_processes": "printf 'Top CPU/memory processes:\\n'; ps -eo pid,ppid,user,stat,pcpu,pmem,etime,comm,args --sort=-pcpu | head -n 40; printf '\\nRunning services:\\n'; systemctl list-units --type=service --state=running --no-pager 2>/dev/null | head -n 80 || true; printf '\\nListening ports:\\n'; ss -lntup 2>/dev/null | head -n 80 || true",
    "check_port": "ss -lntp | grep '{target}'",
    "check_process": "ps aux | grep '{target}' | grep -v grep",
    "process_inspect": "printf 'Matched processes:\\n'; ps aux | grep '{target}' | grep -v grep; printf '\\nResource details:\\n'; pid=$(pgrep -f '{target}' | head -n 1); if [ -n \"$pid\" ]; then ps -p \"$pid\" -o pid,ppid,user,stat,pcpu,pmem,etime,comm,args; cat /proc/$pid/status 2>/dev/null | head -n 40; fi",
    "create_directory": "mkdir -p -- '{target}' && echo 'Directory created: {target}'",
    "restart_service": "systemctl restart '{target}'",
    "service_health": (
        "systemctl status '{target}' --no-pager; "
        "journalctl -u '{target}' -n 60 --no-pager"
    ),
    "server_summary": (
        "printf 'hostname: '; hostname; "
        "printf 'os: '; . /etc/os-release && echo $PRETTY_NAME; "
        "printf 'uptime: '; uptime -p; "
        "printf 'load: '; cat /proc/loadavg; "
        "printf 'memory: '; free -m | awk 'NR==2{print $3\"/\"$2\" MB\"}'; "
        "printf 'disk: '; df -h / | awk 'NR==2{print $3\"/\"$2\" used, \"$5}'"
    ),
}


def run_command(command, timeout=30):
    result = subprocess.run(
        command,
        shell=True,
        capture_output=True,
        text=True,
        timeout=timeout,
    )
    return {
        "stdout": result.stdout,
        "stderr": result.stderr,
        "code": result.returncode,
    }


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
        ps = subprocess.run(
            ["ps", "-eo", "pid=,args="],
            capture_output=True,
            text=True,
            timeout=30,
        )
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
        return {"stdout": "", "stderr": "\n".join(errors), "code": 1}
    return {
        "stdout": f"Stop signal sent to PID(s): {', '.join(map(str, stopped))}\nTarget: {target}",
        "stderr": "\n".join(errors),
        "code": 0 if stopped else 1,
    }


def deploy_ttyd():
    if requests is None:
        return {"stdout": "", "stderr": "requests is required", "code": 2}
    arch = subprocess.check_output("uname -m", shell=True, text=True).strip()
    asset_map = {
        "x86_64": "ttyd.x86_64",
        "amd64": "ttyd.x86_64",
        "aarch64": "ttyd.aarch64",
        "arm64": "ttyd.aarch64",
        "armv7l": "ttyd.armhf",
        "armv6l": "ttyd.armhf",
        "i386": "ttyd.i686",
        "i686": "ttyd.i686",
    }
    asset = asset_map.get(arch)
    if not asset:
        return {"stdout": "", "stderr": f"unsupported arch: {arch}", "code": 2}
    release = requests.get(
        "https://api.github.com/repos/tsl0922/ttyd/releases/latest", timeout=30
    )
    release.raise_for_status()
    url = ""
    for item in release.json().get("assets", []):
        if item.get("name") == asset:
            url = item.get("browser_download_url", "")
            break
    if not url:
        return {"stdout": "", "stderr": f"asset not found: {asset}", "code": 2}
    binary = requests.get(url, timeout=120)
    binary.raise_for_status()
    with open("/usr/local/bin/ttyd", "wb") as file:
        file.write(binary.content)
    os.chmod("/usr/local/bin/ttyd", 0o755)
    service = """[Unit]
Description=ttyd Web Terminal
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/local/bin/ttyd -W -p 7681 /bin/bash
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
"""
    if os.path.isdir("/etc/systemd/system"):
        with open("/etc/systemd/system/ttyd.service", "w", encoding="utf-8") as file:
            file.write(service)
    if shutil.which("systemctl") and os.path.isdir("/run/systemd/system"):
        return run_command(
            "systemctl daemon-reload && systemctl enable --now ttyd && systemctl status ttyd --no-pager",
            timeout=120,
        )
    return run_command(
        "pkill -x ttyd >/dev/null 2>&1 || true; "
        "nohup /usr/local/bin/ttyd -W -p 7681 /bin/bash >/var/log/ttyd.log 2>&1 & "
        "echo $! >/var/run/ttyd.pid; "
        "sleep 2; "
        "ss -lntp 2>/dev/null | grep 7681 || true; "
        "pgrep -af -- 'ttyd|/usr/local/bin/ttyd' || true; "
        "echo 'ttyd started on port 7681'",
        timeout=30,
    )


def deploy_project(repo_url):
    if not repo_url.startswith("https://github.com/"):
        return {"stdout": "", "stderr": "only https://github.com/... repositories are supported", "code": 2}
    run_command("apt-get update >/dev/null 2>&1 || true; apt-get install -y git curl ca-certificates >/dev/null 2>&1 || true", timeout=180)
    name = re.sub(r"[^A-Za-z0-9_.-]+", "-", repo_url.rstrip("/").split("/")[-1].removesuffix(".git"))
    base = "/opt/edgebutler/projects"
    path = os.path.join(base, name)
    os.makedirs(base, exist_ok=True)
    if os.path.isdir(os.path.join(path, ".git")):
        sync = run_command(f"cd {shell_quote(path)} && git pull --ff-only", timeout=180)
    else:
        sync = run_command(f"git clone --depth=1 {shell_quote(repo_url)} {shell_quote(path)}", timeout=300)
    if sync["code"] != 0:
        return sync

    if os.path.exists(os.path.join(path, "docker-compose.yml")) or os.path.exists(os.path.join(path, "compose.yaml")):
        if shutil.which("docker"):
            return run_command(f"cd {shell_quote(path)} && docker compose up -d", timeout=600)
        return {"stdout": f"Repository cloned to {path}", "stderr": "docker compose file found, but docker is not installed", "code": 3}

    if os.path.exists(os.path.join(path, "package.json")):
        if shutil.which("npm"):
            return run_command(f"cd {shell_quote(path)} && npm install && (npm run build || true) && nohup npm start >/var/log/{name}.log 2>&1 & echo $! >/var/run/{name}.pid; echo 'node project started: {name}'", timeout=600)
        return {"stdout": f"Repository cloned to {path}", "stderr": "package.json found, but npm is not installed", "code": 3}

    if os.path.exists(os.path.join(path, "requirements.txt")):
        return run_command(f"cd {shell_quote(path)} && python3 -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt && echo 'python project prepared at {path}; no start command detected'", timeout=600)

    return {
        "stdout": f"Repository cloned to {path}\nNo standard deployment entrypoint detected. Supported: docker-compose.yml, compose.yaml, package.json, requirements.txt.",
        "stderr": "",
        "code": 0,
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
        return run_command(
            f"mkdir -p -- {shell_quote(path)} && echo {shell_quote('Directory created: ' + path)}"
        )

    if action == "deploy_ttyd":
        return deploy_ttyd()

    if action == "deploy_project":
        return deploy_project(target or command)

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


def public_ip():
    if requests is None:
        return ""
    return requests.get("https://api.ipify.org", timeout=10).text.strip()


def register():
    global AGENT_TOKEN, SERVER_ID
    if not ENDPOINT or requests is None:
        return
    if AGENT_TOKEN and SERVER_ID:
        return
    if not INSTALL_TOKEN:
        return

    ip = public_ip()
    payload = {
        "installToken": INSTALL_TOKEN,
        "host": ip,
        "username": os.environ.get("USER", "root"),
        "hostname": socket.gethostname(),
        "location": os.environ.get("EDGEBUTLER_LOCATION", "unknown"),
        "agentUrl": f"http://{ip}.nip.io:{PORT}",
    }
    response = requests.post(f"{ENDPOINT}/api/agent/register", json=payload, timeout=20)
    response.raise_for_status()
    data = response.json()
    AGENT_TOKEN = data["token"]
    SERVER_ID = data["serverId"]

    config_path = "/opt/edgebutler/config.env"
    if os.path.exists(os.path.dirname(config_path)):
        with open(config_path, "a", encoding="utf-8") as file:
            file.write(f"\nEDGEBUTLER_AGENT_TOKEN={AGENT_TOKEN}\n")
            file.write(f"EDGEBUTLER_SERVER_ID={SERVER_ID}\n")


def safe_public_ip():
    try:
        return public_ip()
    except Exception:
        return ""


def poll_loop():
    while True:
        try:
            if requests is None or not ENDPOINT or not AGENT_TOKEN or not SERVER_ID:
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
