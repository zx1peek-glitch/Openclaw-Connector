import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { DangerPage } from "../pages/DangerPage";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args)
}));

test("emergency disconnect invokes kill switch command", async () => {
  render(<DangerPage />);

  fireEvent.click(screen.getByRole("button", { name: "紧急断开" }));

  expect(invokeMock).toHaveBeenCalledWith("emergency_disconnect");
});
