from flask import Flask, request, jsonify
import subprocess
import re

app = Flask(__name__)

# Configuration: Replace with a strong, secure token
SECRET_TOKEN = "YOUR_SUPER_SECRET_TOKEN"

# Allowed command whitelist
ALLOWED_ACTIONS = {
    "check_memory": "free -m",
    "check_disk": "df -h",
    "check_os_version": "cat /etc/os-release",
    "check_cpu": "top -bn1 | head -n 10",
    "check_network": "ping -c 4 8.8.8.8",
    "check_docker": "docker ps",
    "check_logs": "journalctl -n 50 --no-pager",
    "check_top_processes": "ps aux --sort=-%cpu | head -n 15",
    
    # 带参数的操作（使用占位符 {target}）
    "check_port": "ss -lntp | grep '{target}'",
    "check_process": "ps aux | grep '{target}' | grep -v grep",
    "restart_service": "systemctl restart '{target}'"
}

def is_safe_target(target):
    # Strict validation for target parameter: alphanumeric, underscore, dash, dot only
    # Prevents shell injection characters (; & | $ ` > < \n \r)
    if not target:
        return False
    return bool(re.match(r'^[\w\-\.]+$', target))

@app.route('/api/run', methods=['POST'])
def run_command():
    data = request.json
    
    # 1. 安全鉴权
    if not data or data.get('token') != SECRET_TOKEN:
        return jsonify({"error": "未经授权的访问！"}), 401
    
    action = data.get('action')
    target = data.get('target', '')

    if not action or action not in ALLOWED_ACTIONS:
        return jsonify({"error": f"不支持或被禁止的操作: {action}"}), 400

    cmd_template = ALLOWED_ACTIONS[action]
    
    # 如果操作需要参数，进行安全检查并替换
    if "{target}" in cmd_template:
        if not target:
            return jsonify({"error": "该操作需要提供 target 参数"}), 400
        if not is_safe_target(target):
            return jsonify({"error": "非法的 target 参数，包含危险字符"}), 400
        cmd = cmd_template.replace("{target}", target)
    else:
        cmd = cmd_template

    try:
        # 2. Execute Linux Command
        # timeout=15 prevents hanging processes
        # shell=True is utilized safely as commands are statically defined in ALLOWED_ACTIONS
        # and targets are strictly sanitized.
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=15)
        
        return jsonify({
            "stdout": result.stdout,   # 正常输出
            "stderr": result.stderr,   # 报错输出
            "code": result.returncode  # 状态码 (0表示成功)
        })
    except subprocess.TimeoutExpired:
        return jsonify({"error": "命令执行超时 (超过15秒)"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    # 监听 8080 端口
    app.run(host='0.0.0.0', port=8080)