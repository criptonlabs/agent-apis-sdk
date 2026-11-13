/** One prepaid bundle as offered by the API; amounts are decimal strings, never computed here. */
export interface PrepaidBundle {
  id: string;
  amount: string;
  creditedUnits: string;
  approxCalls?: number;
  activation?: string;
}

/** The API's prepaid credits offer (402 challenge or free-tier 429), passed through as read. */
export interface PrepaidOffer {
  bundleVersion: string;
  topupUrl?: string;
  requirementsUrl?: string;
  bundles: PrepaidBundle[];
  /** The assets that pay each denomination, with their CAIP-2 network. */
  assets?: Readonly<Record<string, readonly { asset: string; network: string }[]>>;
}
