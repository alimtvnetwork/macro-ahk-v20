import React from "react";
import { ApiExplorerSwagger } from "./api-explorer";

export const ApiExplorerView = React.forwardRef<HTMLDivElement>(
  function ApiExplorerView(_props, ref) {
    return (
      <div ref={ref} className="space-y-4">
        <h2 className="text-lg font-bold tracking-tight text-foreground">API Explorer</h2>
        <p className="text-sm text-muted-foreground">
          Swagger-style endpoint catalog with live testing for the extension message API.
        </p>
        <ApiExplorerSwagger />
      </div>
    );
  },
);
