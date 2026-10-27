import type { NetworkDescriptor } from "@criptonlabs/agent-apis-core";
import pkg from "../../package.json" with { type: "json" };

/** The Solana network descriptor handed to the core ApiClient. */
export const SOLANA_DESCRIPTOR: NetworkDescriptor = {
  network: "solana",
  productToken: `agent-apis-solana/${pkg.version}`,
};
