// Ambient declaration for packages that don't ship their own TypeScript types.
// `express-mongo-sanitize` has no bundled types and no @types package.
declare module 'express-mongo-sanitize' {
  import type { RequestHandler } from 'express';
  interface Options {
    replaceWith?: string;
    onSanitize?: (data: { req: unknown; key: string }) => void;
    allowDots?: boolean;
    dryRun?: boolean;
  }
  function mongoSanitize(options?: Options): RequestHandler;
  export = mongoSanitize;
}
