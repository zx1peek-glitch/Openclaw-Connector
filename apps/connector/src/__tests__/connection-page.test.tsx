import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { ConnectionPage } from "../pages/ConnectionPage";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args)
}));

test("connect button triggers start_tunnel command", async () => {
  render(<ConnectionPage />);

  fireEvent.change(screen.getByLabelText("Host"), { target: { value: "1.2.3.4" } });
  fireEvent.change(screen.getByLabelText("User"), { target: { value: "root" } });
  fireEvent.click(screen.getByRole("button", { name: "Connect" }));

  expect(invokeMock).toHaveBeenCalledWith("start_tunnel", expect.any(Object));
});
