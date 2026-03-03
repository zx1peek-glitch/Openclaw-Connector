import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { BindingsPage } from "../pages/BindingsPage";

const invokeMock = vi.fn(() => Promise.resolve());
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args)
}));

test("set binding triggers set_agent_binding command", async () => {
  render(<BindingsPage />);

  fireEvent.change(screen.getByLabelText("Agent ID"), { target: { value: "main" } });
  fireEvent.change(screen.getByLabelText("Node ID"), { target: { value: "mac-node-1" } });
  fireEvent.click(screen.getByRole("button", { name: "Set Binding" }));

  await waitFor(() => {
    expect(invokeMock).toHaveBeenCalledWith("set_agent_binding", {
      agentId: "main",
      nodeId: "mac-node-1"
    });
  });
});
