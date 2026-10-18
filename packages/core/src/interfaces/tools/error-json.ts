import { CriptonKitError, type KitErrorJson } from "../../domain/errors.js";

export function toErrorJson(error: unknown): KitErrorJson {
  if (error instanceof CriptonKitError) return error.toJSON();
  return { code: "internal-error", message: "Internal error" };
}
