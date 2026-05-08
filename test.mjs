// test.mjs
import { AgentClient } from "agents/client";

// Initialize AgentClient
const agent = new AgentClient({
  agent: "EdgeButler",
  name: "default-instance",
  host: "http://localhost:5173" 
});

console.log("[测试] 正在呼叫 EdgeButler 实例...");

try {
  // Call the 'run' method with arguments in an array
  const result = await agent.call("run", ["检查内存"]);

  console.log("[EdgeButler 回复]:");
  console.log(result);

} catch (error) {
  console.error("[测试错误] 呼叫失败:", error);
} finally {
  // Close connection and exit
  agent.close();
  process.exit(0);
}