import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { AgentBindings } from "../types/bindings";

type BindingsState = {
  bindings: AgentBindings;
  setBinding: (agentId: string, nodeId: string) => void;
  removeBinding: (agentId: string) => void;
  setBindings: (bindings: AgentBindings) => void;
};

export const useBindingsStore = create<BindingsState>()(
  persist(
    (set) => ({
      bindings: {},
      setBinding: (agentId, nodeId) =>
        set((state) => ({
          bindings: {
            ...state.bindings,
            [agentId]: nodeId
          }
        })),
      removeBinding: (agentId) =>
        set((state) => {
          const next = { ...state.bindings };
          delete next[agentId];
          return { bindings: next };
        }),
      setBindings: (bindings) => set({ bindings })
    }),
    {
      name: "openclaw-connector-bindings",
      storage: createJSONStorage(() => localStorage)
    }
  )
);
