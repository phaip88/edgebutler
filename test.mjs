import { AgentClient } from "agents/client";

const agent = new AgentClient({
  agent: "EdgeButler",
  name: "controller",
  host: "http://localhost:5173"
});

try {
  const result = await agent.call("run", ["检查服务器状态"]);
  console.log("[EdgeButler reply]:");
  console.log(result);
} catch (error) {
  console.error("[EdgeButler test error]:", error);
} finally {
  agent.close();
  process.exit(0);
}
