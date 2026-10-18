import { describe, expect, it } from "vite-plus/test";
import { z } from "zod";
import { CriptonProblemError } from "../../../src/domain/errors.js";
import { ApiClient } from "../../../src/infrastructure/http/api-client.js";
import { FakeTransport, type ScriptedResponse } from "../../support/fake-transport.js";

const schema = z.object({ fee: z.object({ standard: z.string() }) });

function problem(
  slug: string,
  status: number,
  headers: Record<string, string> = {},
): ScriptedResponse {
  return {
    status,
    headers: { "content-type": "application/problem+json", ...headers },
    body: {
      type: `https://api.criptonlabs.com/errors/${slug}.md`,
      title: slug,
      status,
      detail: `${slug} detail`,
      instance: "/v1/xrpl/fee",
    },
  };
}

async function fail(response: ScriptedResponse): Promise<unknown> {
  const fake = new FakeTransport().respond(response);
  const client = new ApiClient(
    { network: "xrpl", productToken: "xrpl-agent-kit/0.1.0" },
    { transport: fake.transport },
  );
  return client.request({ route: "fee", schema }).catch((e: unknown) => e);
}

describe("problem errors", () => {
  it("Invalid parameters from the API", async () => {
    const error = await fail(problem("invalid-parameters", 400));
    expect(error).toBeInstanceOf(CriptonProblemError);
    expect(error).toMatchObject({
      code: "invalid-parameters",
      status: 400,
      title: "invalid-parameters",
      detail: "invalid-parameters detail",
      instance: "/v1/xrpl/fee",
    });
  });

  it("Not found", async () => {
    const error = await fail(problem("not-found", 404));
    expect(error).toBeInstanceOf(CriptonProblemError);
    expect(error).toMatchObject({ code: "not-found", status: 404 });
  });

  it("Upstream unavailable", async () => {
    const error = await fail(problem("upstream-unavailable", 503, { "Retry-After": "5" }));
    expect(error).toBeInstanceOf(CriptonProblemError);
    expect(error).toMatchObject({
      code: "upstream-unavailable",
      status: 503,
      retryAfterSeconds: 5,
    });
  });

  it("Non-problem error body", async () => {
    const error = await fail({
      status: 502,
      headers: { "content-type": "text/html" },
      body: "<html>Bad Gateway</html>",
    });
    expect(error).toBeInstanceOf(CriptonProblemError);
    expect(error).toMatchObject({ code: "unexpected-status", status: 502 });
  });
});
