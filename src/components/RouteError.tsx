import { RotateCcw } from "lucide-react";
import { isRouteErrorResponse, useNavigate, useRouteError } from "react-router-dom";
import { Mascot } from "./Logo";
import { Button } from "./ui";

export function RouteError() {
  const error = useRouteError();
  const navigate = useNavigate();
  const message = isRouteErrorResponse(error) ? `${error.status} ${error.statusText}` : error instanceof Error ? error.message : String(error);
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 py-12 text-center">
      <Mascot size={72} />
      <h1 className="text-2xl font-bold">Something went wrong</h1>
      <p className="max-w-md text-sm text-muted">This page hit an unexpected error. Your funds and keys are not affected.</p>
      <pre className="max-w-md overflow-auto rounded-xl bg-surface-2 px-3 py-2 text-left text-xs text-muted">{message}</pre>
      <div className="flex gap-2">
        <Button variant="secondary" onClick={() => navigate("/")}>Go to dashboard</Button>
        <Button icon={<RotateCcw className="size-4" />} onClick={() => window.location.reload()}>Reload</Button>
      </div>
    </div>
  );
}
