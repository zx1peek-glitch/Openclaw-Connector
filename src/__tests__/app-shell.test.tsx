import { render, screen } from "@testing-library/react";
import App from "../App";

// Mock Tauri API calls so they don't break tests
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn((cmd: string) => {
    if (cmd === "load_app_config") return Promise.resolve(null);
    if (cmd === "detect_local_gateway") return Promise.reject("not found");
    return Promise.resolve({ tunnelState: "disconnected", wsConnected: false });
  }),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {}))
}));

// Mock window.__TAURI_INTERNALS__ for events
Object.defineProperty(window, "__TAURI_INTERNALS__", {
  value: {
    transformCallback: vi.fn()
  }
});

test("renders connector shell", () => {
  render(<App />);
  expect(screen.getByText("连接器控制台")).toBeInTheDocument();
});
