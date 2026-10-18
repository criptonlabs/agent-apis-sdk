import { MissingPeerDependencyError } from "../domain/errors.js";

export type PeerImporter = (specifier: string) => Promise<unknown>;

const defaultImporter: PeerImporter = (specifier) => import(specifier);

export async function loadPeer<T>(
  packageName: string,
  importer: PeerImporter = defaultImporter,
): Promise<T> {
  try {
    return (await importer(packageName)) as T;
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    if (code === "ERR_MODULE_NOT_FOUND" || code === "MODULE_NOT_FOUND") {
      throw new MissingPeerDependencyError(packageName);
    }
    throw error;
  }
}
