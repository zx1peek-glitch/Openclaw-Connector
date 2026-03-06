import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { ConnectionPage } from "../pages/ConnectionPage";

const invokeMock = vi.fn((command: string) => {
  if (command === "get_tunnel_status" || command === "start_tunnel" || command === "stop_tunnel") {
    return Promise.resolve({
      state: "connected",
      reconnectAttempts: 0,
      lastError: null
    });
  }
  return Promise.resolve(undefined);
});
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args)
}));

test("connect button triggers start_tunnel command", async () => {
  render(<ConnectionPage />);

  const hostInput = screen.getByLabelText("主机");
  const userInput = screen.getByLabelText("用户");

  expect(userInput).toHaveAttribute("autocapitalize", "none");
  expect(userInput).toHaveAttribute("autocorrect", "off");
  expect(userInput).toHaveAttribute("spellcheck", "false");

  fireEvent.change(hostInput, { target: { value: "1.2.3.4" } });
  fireEvent.change(userInput, { target: { value: "root" } });
  fireEvent.click(screen.getByRole("button", { name: "连接" }));

  await waitFor(() => {
    expect(invokeMock).toHaveBeenCalledWith("start_tunnel", expect.any(Object));
  });
});
