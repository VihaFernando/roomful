import { Component, type ReactNode } from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "../components/ui/Button";
import { StatePanel } from "../components/ui/States";

/** Last line of defence: a render error shows a recoverable screen instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: unknown) {
    console.error("UI error", error);
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <StatePanel
        tone="error"
        icon={<TriangleAlert className="size-6" />}
        title="Something broke on this screen"
        body="Your seat in the room is safe. Reload to get back in."
        actions={
          <Button variant="primary" size="lg" block onClick={() => location.reload()}>
            Reload
          </Button>
        }
      />
    );
  }
}
