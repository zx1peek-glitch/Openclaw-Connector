import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

type CallbackPayload = {
  taskId: string;
  exitCode: number;
  stdout: string;
};

export type MockGatewayHandle = {
  baseUrl: string;
  close: () => Promise<void>;
  getCallbacks: () => CallbackPayload[];
};

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

export async function startMockGateway(): Promise<MockGatewayHandle> {
  const callbacks: CallbackPayload[] = [];

  const server: Server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (req.url === "/health" && req.method === "GET") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (req.url === "/tasks/next" && req.method === "POST") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          taskId: "task-1",
          agentId: "main",
          action: "system.run",
          args: { command: "printf ok" },
          timeoutSec: 5
        })
      );
      return;
    }

    if (req.url === "/tasks/task-1/callback" && req.method === "POST") {
      const raw = await readBody(req);
      callbacks.push(JSON.parse(raw) as CallbackPayload);
      res.writeHead(204);
      res.end();
      return;
    }

    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("mock gateway failed to bind");
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
    getCallbacks: () => callbacks
  };
}
