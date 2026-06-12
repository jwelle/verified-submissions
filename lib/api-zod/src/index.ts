// Zod schemas (runtime values) — includes HealthCheckResponse, ScoreLeadResponse, etc.
export * from "./generated/api";
// Generated response interfaces are exposed under the `Types` namespace because
// several share names with the zod schemas above (e.g. ScoreLeadResponse,
// ScoreAndRouteResponse); namespacing avoids the wildcard export collision.
// Access as e.g. `import { Types } from "@workspace/api-zod"; Types.ScoreAndRouteResponse`.
export * as Types from "./generated/types";
