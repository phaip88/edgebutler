from flask import Flask, jsonify, request
import os
import socket
import subprocess

try:
    import requests
except ImportError:
    requests = None

app = Flask(__name__)

ENDPOINT = os.environ.get("EDGEBUTLER_ENDPOINT", "").rstrip("/")
INSTALL_TOKEN = os.environ.get("EDGEBUTLER_INSTALL_TOKEN", "")
AGENT_TOKEN = os.environ.get("EDGEBUTLER_AGENT_TOKEN", "")
PORT = int(os.environ.get("EDGEBUTLER_PORT", "8080"))

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


def run_command(command):
    result = subprocess.run(
        command,
        shell=True,
        capture_output=True,
        text=True,
        timeout=30,
    )
    return {
        "stdout": result.stdout,
        "stderr": result.stderr,
        "code": result.returncode,
    }


def public_ip():
    if requests is None:
        return ""
    return requests.get("https://api.ipify.org", timeout=10).text.strip()


def register():
    global AGENT_TOKEN
    if not ENDPOINT or not INSTALL_TOKEN or AGENT_TOKEN or requests is None:
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

    config_path = "/opt/edgebutler/config.env"
    if os.path.exists(os.path.dirname(config_path)):
        with open(config_path, "a", encoding="utf-8") as file:
            file.write(f"\nEDGEBUTLER_AGENT_TOKEN={AGENT_TOKEN}\n")


@app.route("/api/run", methods=["POST"])
def api_run():
    data = request.get_json(force=True, silent=True) or {}
    if data.get("token") != AGENT_TOKEN:
        return jsonify({"error": "unauthorized"}), 401

    action = data.get("action", "")
    target = str(data.get("target", ""))
    command = str(data.get("command", ""))

    if action == "shell":
        if not command:
            return jsonify({"error": "command is required"}), 400
        return jsonify(run_command(command))

    if action not in ACTIONS:
        return jsonify({"error": f"unsupported action: {action}"}), 400

    template = ACTIONS[action]
    if "{target}" in template:
        if not target:
            return jsonify({"error": "target is required"}), 400
        command = template.replace("{target}", target.replace("'", "'\\''"))
    else:
        command = template

    return jsonify(run_command(command))


if __name__ == "__main__":
    register()
    app.run(host="0.0.0.0", port=PORT)
