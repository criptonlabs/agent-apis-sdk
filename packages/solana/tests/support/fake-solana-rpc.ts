import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { getBase58Decoder } from "@solana/kit";
import { getMintEncoder, TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";

export interface FakeSolanaRpc {
  url: string;
  /** Every JSON-RPC method name received, in order. */
  methods: string[];
  stop(): Promise<void>;
}

interface RpcRequest {
  id: unknown;
  method: string;
  params?: unknown[];
}

const SLOT = 400_000_000;
const BLOCKHASH = getBase58Decoder().decode(new Uint8Array(32).fill(7));

function mintAccount(decimals: number): unknown {
  const data = getMintEncoder().encode({
    mintAuthority: null,
    supply: 1_000_000_000_000n,
    decimals,
    isInitialized: true,
    freezeAuthority: null,
  });
  return {
    data: [Buffer.from(data).toString("base64"), "base64"],
    executable: false,
    lamports: 1_461_600,
    owner: TOKEN_PROGRAM_ADDRESS,
    rentEpoch: 0,
    space: data.length,
  };
}

const handlers: Record<string, () => unknown> = {
  getAccountInfo: () => ({ context: { slot: SLOT }, value: mintAccount(6) }),
  getLatestBlockhash: () => ({
    context: { slot: SLOT },
    value: { blockhash: BLOCKHASH, lastValidBlockHeight: SLOT + 150 },
  }),
};

function answer(request: RpcRequest): unknown {
  const handler = handlers[request.method];
  if (!handler) {
    return {
      jsonrpc: "2.0",
      id: request.id,
      error: { code: -32601, message: `fake-solana-rpc: ${request.method} not supported` },
    };
  }
  return { jsonrpc: "2.0", id: request.id, result: handler() };
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function listener(methods: string[]) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    const request = JSON.parse(await readBody(req)) as RpcRequest;
    methods.push(request.method);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(answer(request)));
  };
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeAllConnections();
  });
}

/** Local JSON-RPC server on 127.0.0.1 (random port) answering a 6-decimal Token-program mint and a blockhash. */
export async function startFakeSolanaRpc(): Promise<FakeSolanaRpc> {
  const methods: string[] = [];
  const server = createServer((req, res) => void listener(methods)(req, res));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}`, methods, stop: () => close(server) };
}

export const FAKE_BLOCKHASH = BLOCKHASH;
