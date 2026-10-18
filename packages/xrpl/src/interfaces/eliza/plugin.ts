// Local structural types: @elizaos/core 1.7.2 ships extensionless relative re-exports in its
// .d.ts files that NodeNext cannot resolve, so its `Plugin` type is unreachable here (design D11).
import { CriptonValidationError, loadPeer } from "@criptonlabs/agent-apis-core";
import { toElizaResult } from "@criptonlabs/agent-apis-core/eliza";
import type { z } from "zod";
import type { XrplAgentKit, XrplKitConfig } from "../../index.js";
import { resolveKit } from "../tools/kit.js";
import { createXrplTools } from "../tools/registry.js";

export interface ElizaActionResultLike {
  success: boolean;
  text?: string;
  data?: unknown;
}

export interface ElizaActionLike {
  name: string;
  similes?: string[];
  description: string;
  examples?: unknown[][];
  validate(runtime: unknown, message: unknown, state?: unknown): Promise<boolean>;
  handler(
    runtime: unknown,
    message: unknown,
    state?: unknown,
    options?: unknown,
    callback?: unknown,
  ): Promise<ElizaActionResultLike>;
}

export interface ElizaProviderLike {
  name: string;
  description?: string;
  get(
    runtime: unknown,
    message: unknown,
    state?: unknown,
  ): Promise<{ text?: string; values?: Record<string, unknown>; data?: Record<string, unknown> }>;
}

export interface ElizaPluginLike {
  name: string;
  description: string;
  actions: ElizaActionLike[];
  providers: ElizaProviderLike[];
}

interface ElizaRuntimeLike {
  useModel(type: string, params: { prompt: string }): Promise<unknown>;
  composeState(message: unknown): Promise<unknown>;
}

interface ElizaCoreModule {
  ModelType: { OBJECT_SMALL: string };
  composePromptFromState(args: { state: unknown; template: string }): string;
}

const ACTIONS = [
  {
    name: "PREPARE_XRPL_PAYMENT",
    tool: "xrpl_prepare_payment",
    similes: ["PREPARE_XRP_PAYMENT", "BUILD_XRPL_PAYMENT"],
    description:
      "Prepare an unsigned XRPL payment (readiness check, path, fee). Never signs or submits.",
  },
  {
    name: "QUOTE_XRPL_DEX",
    tool: "xrpl_dex_quote",
    similes: ["XRPL_DEX_QUOTE", "XRPL_SLIPPAGE_QUOTE"],
    description:
      "Quote buying an asset on the XRPL DEX: filled amount, price, slippage, best venue.",
  },
  {
    name: "CHECK_XRPL_PAYMENT_READINESS",
    tool: "xrpl_payment_readiness",
    similes: ["XRPL_PAYMENT_READINESS", "CAN_I_PAY_ON_XRPL"],
    description: "Check whether an XRPL payment between two accounts can succeed.",
  },
] as const;

function contentOf(message: unknown): Record<string, unknown> {
  const content = (message as { content?: unknown } | null)?.content;
  return typeof content === "object" && content !== null
    ? (content as Record<string, unknown>)
    : {};
}

function pickFields(source: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  return Object.fromEntries(keys.filter((k) => source[k] !== undefined).map((k) => [k, source[k]]));
}

async function extract(
  runtime: ElizaRuntimeLike,
  message: unknown,
  keys: string[],
  description: string,
): Promise<Record<string, unknown>> {
  const content = contentOf(message);
  const structured = pickFields(content, keys);
  if (Object.keys(structured).length > 0) return structured;
  const eliza = await loadPeer<ElizaCoreModule>("@elizaos/core");
  const state = await runtime.composeState(message);
  const template = `Extract the parameters for this request: ${description}\nFields: ${keys.join(", ")}.\nAnswer with a JSON object holding only the fields found in the message.`;
  const text = typeof content.text === "string" ? content.text : "";
  const prompt = `${eliza.composePromptFromState({ state, template })}\n\nMessage:\n${text}`;
  const extracted = await runtime.useModel(eliza.ModelType.OBJECT_SMALL, { prompt });
  return typeof extracted === "object" && extracted !== null
    ? pickFields(extracted as Record<string, unknown>, keys)
    : {};
}

function validate(schema: z.ZodType, input: Record<string, unknown>): unknown {
  const parsed = schema.safeParse(input);
  if (parsed.success) return parsed.data;
  const issue = parsed.error.issues[0];
  const field = String(issue?.path[0] ?? "input");
  throw new CriptonValidationError(field, `${field}: ${issue?.message ?? "invalid input"}`);
}

function build(getKit: () => XrplAgentKit): ElizaPluginLike {
  const tools = () => new Map(createXrplTools(getKit()).map((t) => [t.name, t]));
  const actions: ElizaActionLike[] = ACTIONS.map((def) => ({
    name: def.name,
    similes: [...def.similes],
    description: def.description,
    validate: async () => true,
    async handler(runtime, message) {
      try {
        const tool = tools().get(def.tool);
        if (tool === undefined) throw new Error(`missing tool ${def.tool}`);
        const keys = Object.keys((tool.inputSchema as unknown as z.ZodObject).shape);
        const input = await extract(runtime as ElizaRuntimeLike, message, keys, def.description);
        const value = await tool.run(validate(tool.inputSchema, input));
        return toElizaResult({ ok: true, value });
      } catch (error) {
        return toElizaResult({ ok: false, error });
      }
    },
  }));
  const provider: ElizaProviderLike = {
    name: "XRPL_FEE_STATUS",
    description: "Current XRPL fee tiers and congestion band.",
    async get() {
      try {
        const fee = (await getKit().data.fee()).data;
        return { text: `XRPL fee status: ${JSON.stringify(fee)}`, data: { fee } };
      } catch (error) {
        return { text: toElizaResult({ ok: false, error }).text };
      }
    },
  };
  return {
    name: "criptonlabs-xrpl",
    description: "Read-only XRP Ledger data, payment preparation and DEX quotes by Criptonlabs.",
    actions,
    providers: [provider],
  };
}

function lazy(make: () => XrplAgentKit): () => XrplAgentKit {
  let kit: XrplAgentKit | undefined;
  return () => (kit ??= make());
}

export function createCriptonXrplPlugin(
  kitOrConfig?: XrplAgentKit | XrplKitConfig,
): ElizaPluginLike {
  return build(lazy(() => resolveKit(kitOrConfig)));
}

export const criptonXrplPlugin: ElizaPluginLike = build(lazy(() => resolveKit()));
