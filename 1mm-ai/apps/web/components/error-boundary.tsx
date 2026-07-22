"use client";

import { Component, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/** Catches render errors so one broken component never kills the whole app. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    // Client-side log only – no secrets in render errors.
    console.error("UI error boundary:", error.message);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
          <p className="text-lg font-medium">Noget gik galt i visningen.</p>
          <p className="text-sm text-text-secondary">
            Prøv at genindlæse siden. Dine samtaler er gemt.
          </p>
          <Button onClick={() => window.location.reload()}>Genindlæs siden</Button>
        </div>
      );
    }
    return this.props.children;
  }
}
