export interface Meta {
  ledger_index?: number | null;
  ledger_state?: "validated" | "open" | (string & {});
  slot?: number | null;
  as_of: string;
  age_seconds: number;
  cache: "hit" | "miss" | "stale" | (string & {});
  stale: boolean;
}
