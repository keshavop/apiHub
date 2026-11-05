declare module "swagger-ui-dist/swagger-ui-es-bundle.js" {
  type SwaggerRequest = { url: string; [key: string]: unknown };
  type Options = {
    domNode: HTMLElement;
    spec: object;
    docExpansion?: "list" | "full" | "none";
    defaultModelsExpandDepth?: number;
    deepLinking?: boolean;
    displayRequestDuration?: boolean;
    tryItOutEnabled?: boolean;
    persistAuthorization?: boolean;
    requestInterceptor?: (req: SwaggerRequest) => SwaggerRequest;
  };
  const SwaggerUIBundle: (options: Options) => unknown;
  export default SwaggerUIBundle;
}
