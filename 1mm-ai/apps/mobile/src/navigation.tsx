import { createContext, useContext } from "react";

/**
 * Deliberately small state-based navigator (no native navigation deps):
 * fewer moving parts in the monorepo and everything runs in Expo Go.
 */
export type Route =
  | { name: "conversations" }
  | { name: "chat"; conversationId?: string }
  | { name: "memories" }
  | { name: "settings" };

export interface Navigator {
  route: Route;
  navigate(route: Route): void;
  back(): void;
}

export const NavigationContext = createContext<Navigator | null>(null);

export function useNavigation(): Navigator {
  const ctx = useContext(NavigationContext);
  if (!ctx) throw new Error("useNavigation must be used inside NavigationContext");
  return ctx;
}
