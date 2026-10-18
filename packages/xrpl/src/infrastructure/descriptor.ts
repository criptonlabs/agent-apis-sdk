import type { NetworkDescriptor } from "@criptonlabs/agent-apis-core";
import pkg from "../../package.json" with { type: "json" };

/** The XRPL network descriptor handed to the core ApiClient. */
export const XRPL_DESCRIPTOR: NetworkDescriptor = {
  network: "xrpl",
  productToken: `xrpl-agent-kit/${pkg.version}`,
  routeTimeoutsMs: { paths: 30000 },
};

/** Timeout of the multi-hop path finding route (design D1). */
export const PATHS_TIMEOUT_MS = 30000;
