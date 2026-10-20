import { Compass } from "lucide-react";
import { useNavigate } from "react-router";
import { PageShell } from "../components/layout/PageShell";
import { Button } from "../components/ui/Button";
import { StatePanel } from "../components/ui/States";

export function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <PageShell back="/">
      <StatePanel
        icon={<Compass className="size-6" />}
        title="Nothing here"
        body="This page doesn't exist. If someone sent you a room link, check that it's complete."
        actions={
          <Button variant="primary" size="lg" block onClick={() => navigate("/")}>
            Go home
          </Button>
        }
      />
    </PageShell>
  );
}
