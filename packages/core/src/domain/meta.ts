export interface Meta {
  ledger_index?: number;
  slot?: number;
  as_of: string;
  age_seconds: number;
  cache: "hit" | "miss" | "stale" | (string & {});
  stale: boolean;
}
