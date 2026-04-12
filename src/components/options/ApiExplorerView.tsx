import { ApiExplorerSwagger } from "./api-explorer";

export function ApiExplorerView() {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold tracking-tight text-foreground">API Explorer</h2>
      <p className="text-sm text-muted-foreground">
        Swagger-style endpoint catalog with live testing for the extension message API.
      </p>
      <ApiExplorerSwagger />
    </div>
  );
}

export default ApiExplorerView;
