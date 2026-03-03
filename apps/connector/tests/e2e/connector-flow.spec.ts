// @vitest-environment node
import { afterEach, expect, test } from "vitest";
import { runConnectorFlow } from "../../src/flows/connectorFlow";
import { startMockGateway, type MockGatewayHandle } from "../mock-gateway/server";

let gateway: MockGatewayHandle | null = null;

afterEach(async () => {
  if (gateway) {
    await gateway.close();
    gateway = null;
  }
});

test("connect -> heartbeat -> task execute -> callback", async () => {
  gateway = await startMockGateway();

  await runConnectorFlow({
    gatewayBaseUrl: gateway.baseUrl,
    localNodeId: "mac-node-1",
    bindings: { main: "mac-node-1" }
  });

  const callbacks = gateway.getCallbacks();
  expect(callbacks).toHaveLength(1);
  expect(callbacks[0]).toMatchObject({ taskId: "task-1", exitCode: 0, stdout: "ok" });
});
