import { mapHealthSummary, type HealthSummary } from "../types/health";

test("maps failed samples to offline", () => {
  const summary: HealthSummary = {
    latencyMs: 0,
    tunnelConnected: false,
    gatewayOk: false,
    consecutiveFailures: 3
  };
  expect(mapHealthSummary(summary)).toBe("offline");
});
