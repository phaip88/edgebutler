import { Agent, callable, routeAgentRequest } from "agents";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type MyState = {
  rules: string;
  history: ChatMessage[];
};

export class EdgeButler extends Agent<any, MyState> {
  initialState: MyState = { rules: "暂无", history: [] };

  @callable()
  async run(command: string) {
    try {
      const currentRules = this.state?.rules || this.initialState.rules;
      const history = this.state?.history || [];

      if (command.startsWith("老规矩：")) {
        const newRule = command.replace("老规矩：", "");
        this.setState({ rules: newRule });
        return `[系统] 规则更新成功：${newRule}`;
      }

      // ==========================================
      // Phase 1: Intent Recognition & Action Parsing
      // ==========================================
      const systemPrompt = `
你是一个专业的 Linux 运维总监。
出于极高的安全要求，你**绝对不能**直接生成任意的 Linux 终端命令！
你必须将用户的需求转换为受限的、安全的“动作意图”。
当前老规矩/记忆：${currentRules}。

请只输出合法的 JSON，不要包含任何额外的废话或 Markdown 符号。

格式要求：
如果是闲聊或不支持的操作，返回: {"type": "chat", "text": "你的回复"}
如果是运维请求，返回: {"type": "action", "action": "具体的动作名", "target": "目标参数（如果没有则留空）"}

目前服务器仅仅允许执行以下安全的 action 白名单：
- "check_memory" (查内存)
- "check_disk" (查磁盘)
- "check_os_version" (查系统版本)
- "check_cpu" (查系统负载、CPU使用率)
- "check_top_processes" (查资源占用最高的进程、当前运行的所有进程列表、系统负载最高是谁)
- "check_network" (查网络连通性)
- "check_docker" (查运行中的 Docker 容器)
- "check_logs" (查系统最近的系统日志)
- "check_port" (查端口，**必须**在 target 填端口号，例如 "2096")
- "check_process" (查指定进程，**必须**在 target 填具体的进程名，例如 "nginx")
- "restart_service" (重启服务，**必须**在 target 填服务名，例如 "nginx")

⚠️ 重要规则：如果用户的需求需要用到上述带 target 的动作（如 check_port, check_process, restart_service），但用户在上下文中并没有明确指出具体的端口号或服务名，你**必须**返回 type 为 "chat"，并主动询问用户具体要查询或操作哪个目标。绝对不能在 target 为空的情况下返回这些 action！

如果用户的需求不在上述白名单中，或者是危险的破坏性操作（如 rm, kill, 刷机等），请返回 type 为 "chat"，并礼貌地拒绝执行。

例如用户说查2096端口开了没，你应该返回: {"type": "action", "action": "check_port", "target": "2096"}
例如用户说看看磁盘，你应该返回: {"type": "action", "action": "check_disk", "target": ""}
例如用户说帮我查一下指定进程，你应该返回: {"type": "chat", "text": "请问您想查询哪个具体的进程（例如 nginx 或 python）？"}
例如用户说有哪些进程在运行，你应该返回: {"type": "action", "action": "check_top_processes", "target": ""}
      `;

      // 组装带有上下文的对话
      const messages: any[] = [
        { role: "system", content: systemPrompt },
        ...history,
        { role: "user", content: command }
      ];

      const aiResponse = await this.env.AI.run("@cf/meta/llama-3-8b-instruct", {
        messages: messages
      });

      let aiPlan;
      try {
        // 清理可能带有的 markdown 标记并解析 JSON
        const rawJson = aiResponse.response.replace(/```json/g, "").replace(/```/g, "").trim();
        aiPlan = JSON.parse(rawJson);
      } catch (e) {
        return `⚠️ AI 解析指令失败，请换个说法。AI 原话: ${aiResponse.response}`;
      }

      let newHistory = [...history, { role: "user", content: command }];

      // ==========================================
      // Phase 2: Action Execution based on Intent
      // ==========================================
      if (aiPlan.type === "chat") {
        newHistory.push({ role: "assistant", content: JSON.stringify({ type: "chat", text: aiPlan.text }) });
        if (newHistory.length > 10) newHistory = newHistory.slice(-10);
        this.setState({ history: newHistory });

        return `[EdgeButler] ${aiPlan.text}`;
      }

      if (aiPlan.type === "action") {
        // Validation: Intercept actions requiring a target when none is provided
        const requiresTarget = ["check_port", "check_process", "restart_service"];
        if (requiresTarget.includes(aiPlan.action) && !aiPlan.target) {
          const typeName = aiPlan.action.includes('port') ? '端口' : (aiPlan.action.includes('service') ? '服务' : '进程');
          const replyText = `请明确指出您想要操作的具体${typeName}名称或号码。`;
          const reply = `[EdgeButler] ${replyText}`;
          
          newHistory.push({ role: "assistant", content: JSON.stringify({ type: "chat", text: replyText }) });
          if (newHistory.length > 10) newHistory = newHistory.slice(-10);
          this.setState({ history: newHistory });
          
          return reply;
        }

        // AI 决定执行受限动作，开始呼叫 VPS 的 API
        const vpsIp = this.env.VPS_IP;
        const vpsToken = this.env.VPS_TOKEN;
        
        // 如果填的是纯 IP，Cloudflare 会拦截并报 1003 Error。所以如果是 IP，自动加上 .nip.io 变成域名。
        const isIp = /^[0-9.]+$/.test(vpsIp);
        const targetUrl = isIp ? `http://${vpsIp}.nip.io:8080/api/run` : `http://${vpsIp}:8080/api/run`;
        
        const execRes = await fetch(targetUrl, {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "User-Agent": "EdgeButler/1.0 Cloudflare-Worker"
          },
          body: JSON.stringify({ 
            token: vpsToken, 
            action: aiPlan.action,
            target: aiPlan.target || ""
          })
        });

        if (!execRes.ok) {
          const errText = await execRes.text();
          console.error(`VPS Request Failed: ${execRes.status} ${execRes.statusText} - ${errText}`);
          return `[错误] 无法连接到服务器 (${vpsIp}, HTTP ${execRes.status})。\n详情: ${errText.substring(0, 100)}`;
        }

        const vpsData = await execRes.json();
        
        // ==========================================
        // Phase 3: Result Summarization (ReAct Loop)
        // ==========================================
        let rawOutput = vpsData.stdout || vpsData.stderr;
        if (!rawOutput) {
          if (aiPlan.action === "check_process" || aiPlan.action === "check_port") {
            rawOutput = "无输出结果。这通常意味着该进程/服务完全没有在运行，或者该端口根本没被占用。";
          } else {
            rawOutput = "命令执行成功，但没有任何返回信息。";
          }
        }
        
        // Truncate output to prevent exceeding model token limits
        if (rawOutput.length > 800) rawOutput = rawOutput.substring(0, 800) + "...(truncated)";

        const summarizePrompt = `
You previously executed the action: \`${aiPlan.action}\` (Target: ${aiPlan.target || 'None'})
The raw server output is:
${rawOutput}
Please provide a brief, professional summary of the results in Chinese for the user.
Warning: If the output indicates "no output" or "not found", explicitly state that the process/service does not exist or is not running. Do not fabricate successful statuses.
        `;

        const summaryRes = await this.env.AI.run("@cf/meta/llama-3-8b-instruct", {
          messages:[{ role: "user", content: summarizePrompt }]
        });

        // Update history with action intent and execution summary
        const actionIntent = JSON.stringify({
          type: "action",
          action: aiPlan.action,
          target: aiPlan.target || ""
        });
        newHistory.push({ role: "assistant", content: actionIntent });
        
        newHistory.push({ role: "user", content: `[System Report - Execution Result]:\n${summaryRes.response}` });
        
        if (newHistory.length > 10) newHistory = newHistory.slice(-10);
        this.setState({ history: newHistory });

        return `[执行动作]: ${aiPlan.action} ${aiPlan.target || ''}\n\n[管家汇报]:\n${summaryRes.response}`;
      }

      return "[警告] 遇到未知的操作类型。";
    } catch (error: any) {
      return `[系统错误]: ${error.message}`;
    }
  }
}

// Application Entry Point
export default {
  async fetch(request: Request, env: any, ctx: any) {
    const url = new URL(request.url);
    
    console.log(`[Incoming Request]: ${request.method} ${url.pathname}`);

    if (url.pathname === "/telegram" && request.method === "POST") {
      try {
        const update = await request.json();
        console.log("[Telegram Update Received]:", JSON.stringify(update));
        
        if (update.message && update.message.text) {
          const chatId = update.message.chat.id;
          const text = update.message.text;
          console.log(`[User Input]: ${text}`);

          const id = env.EdgeButler.idFromName("default-instance");
          const stub = env.EdgeButler.get(id) as any;
          
          console.log("[AI Processing Started]");
          const responseText = await stub.run(text);
          console.log("[AI Processing Completed]");

          const botToken = env.TELEGRAM_BOT_TOKEN; 
          const tgResponse = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: chatId, text: responseText })
          });
          
          const tgResult = await tgResponse.json();
          console.log("[Telegram API Response]:", JSON.stringify(tgResult));
        } else {
          console.log("[Notice]: Non-text message received, ignoring.");
        }
      } catch (error) {
        console.error("[Telegram Route Error]:", error);
      }
      return new Response("OK");
    }

    return (await routeAgentRequest(request, env)) ?? new Response("Not Found", { status: 404 });
  }
};