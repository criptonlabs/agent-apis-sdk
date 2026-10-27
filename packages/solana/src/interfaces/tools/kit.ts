import { createSolanaAgentKit, type SolanaAgentKit, type SolanaKitConfig } from "../../index.js";
import { readSolanaEnv } from "../../infrastructure/config/solana-env.js";

export function isKit(value: SolanaAgentKit | SolanaKitConfig): value is SolanaAgentKit {
  return "data" in value;
}

/** A kit is used as given; a config (or the environment when absent) builds one. */
export function resolveKit(kitOrConfig?: SolanaAgentKit | SolanaKitConfig): SolanaAgentKit {
  if (kitOrConfig !== undefined && isKit(kitOrConfig)) return kitOrConfig;
  return createSolanaAgentKit(kitOrConfig ?? readSolanaEnv(process.env));
}
