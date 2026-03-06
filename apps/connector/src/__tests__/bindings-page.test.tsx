import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { BindingsPage } from "../pages/BindingsPage";

const invokeMock = vi.fn(() => Promise.resolve());
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args)
}));

test("set binding triggers set_agent_binding command", async () => {
  render(<BindingsPage />);

  fireEvent.change(screen.getByLabelText("Agent 标识"), { target: { value: "main" } });
  fireEvent.click(screen.getByRole("button", { name: "绑定到本机" }));

  await waitFor(() => {
    expect(invokeMock).toHaveBeenCalledWith("set_agent_binding", expect.objectContaining({
      agentId: "main"
    }));
  });
});
