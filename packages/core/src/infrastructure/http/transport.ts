import type { Transport } from "../../application/ports.js";

/** Default transport: the global fetch. */
export const defaultTransport: Transport = (url, init) => fetch(url, init);
