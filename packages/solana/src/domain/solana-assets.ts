export type SolanaNetworkName = "mainnet" | "devnet";
export type SolanaPayAsset = "USDC" | "EURC";

/** CAIP-2 identifiers the API uses for its Solana payment networks. */
export const SOLANA_CAIP2: Record<SolanaNetworkName, string> = {
  mainnet: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
  devnet: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
};

/** Official mints of the payment assets per network (the API's asset registry). */
export const PAY_ASSET_MINTS: Record<SolanaPayAsset, Record<SolanaNetworkName, string>> = {
  USDC: {
    mainnet: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    devnet: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
  },
  EURC: {
    mainnet: "HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr",
    devnet: "HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr",
  },
};

export const PAY_ASSET_DECIMALS: Record<SolanaPayAsset, number> = { USDC: 6, EURC: 6 };
