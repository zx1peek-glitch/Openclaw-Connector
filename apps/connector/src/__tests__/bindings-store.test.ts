import { useBindingsStore } from "../store/useBindingsStore";

test("updates one agent binding without touching others", () => {
  useBindingsStore.setState({ bindings: { main: "mac-node-1", ops: "mac-node-2" } });
  useBindingsStore.getState().setBinding("main", "mac-node-3");

  expect(useBindingsStore.getState().bindings.main).toBe("mac-node-3");
  expect(useBindingsStore.getState().bindings.ops).toBe("mac-node-2");
});
