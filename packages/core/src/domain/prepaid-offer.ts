/** One prepaid bundle as offered by the API; amounts are decimal strings, never computed here. */
export interface PrepaidBundle {
  id: string;
  amount: string;
  creditedUnits: string;
  approxCalls?: number;
}

/** The API's prepaid credits offer (402 challenge or free-tier 429), passed through as read. */
export interface PrepaidOffer {
  bundleVersion: string;
  topupUrl?: string;
  requirementsUrl?: string;
  bundles: PrepaidBundle[];
}
