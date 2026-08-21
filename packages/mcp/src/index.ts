import {runCheck} from "./check";
import {startHttpServer, startStdioServer} from "./server";

const mode = process.argv[2] ?? "stdio";

if (mode === "stdio") {
  await startStdioServer();
} else if (mode === "http") {
  startHttpServer();
} else if (mode === "check") {
  await runCheck();
} else {
  throw new Error(`Unknown Make Video MCP mode "${mode}". Use stdio, http, or check.`);
}
