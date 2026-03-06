import { render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { HealthPage } from "../pages/HealthPage";

const invokeMock = vi.fn((command: string) => {
  if (command === "get_health_summary") {
    return Promise.resolve({
      latencyMs: 42,
      tunnelConnected: true,
      gatewayOk: true,
      consecutiveFailures: 0
    });
  }
  return Promise.resolve(undefined);
});

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args)
}));

test("health page polls get_health_summary and displays status", async () => {
  render(<HealthPage />);

  await waitFor(() => {
    expect(invokeMock).toHaveBeenCalledWith("get_health_summary");
  });

  await waitFor(() => {
    expect(screen.getByText("在线")).toBeInTheDocument();
  });
});
