import { createXrplAgentKit, type XrplAgentKit, type XrplKitConfig } from "../../index.js";
import { readXrplEnv } from "../../infrastructure/config/xrpl-env.js";

export function isKit(value: XrplAgentKit | XrplKitConfig): value is XrplAgentKit {
  return "data" in value;
}

/** A kit is used as given; a config (or the environment when absent) builds one. */
export function resolveKit(kitOrConfig?: XrplAgentKit | XrplKitConfig): XrplAgentKit {
  if (kitOrConfig !== undefined && isKit(kitOrConfig)) return kitOrConfig;
  return createXrplAgentKit(kitOrConfig ?? readXrplEnv(process.env));
}
