import { describe, expect, it } from "vite-plus/test";
import { z } from "zod";
import { CriptonProblemError } from "../../../src/domain/errors.js";
import { ApiClient } from "../../../src/infrastructure/http/api-client.js";
import { parseProblem } from "../../../src/infrastructure/http/problem.js";
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
    { network: "xrpl", productToken: "agent-apis-xrpl/0.1.0" },
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

function problemResponse(body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status: 400,
    headers: { "content-type": "application/problem+json" },
  });
}

const invalidParameters = {
  type: "https://api.criptonlabs.com/errors/invalid-parameters.md",
  title: "Bad Request",
  status: 400,
  detail: "One or more parameters are invalid.",
  instance: "/v1/xrpl/account/rExample/lines",
};

/** Reads `errors` through a record so the test compiles before the member exists. */
function fieldErrorsOf(error: CriptonProblemError): unknown {
  return (error as unknown as Record<string, unknown>).errors;
}

describe("problem field errors", () => {
  it("Field errors from the API", async () => {
    const fieldErrors = [{ field: "limit", message: "must be an integer from 10 to 400" }];
    const error = await parseProblem(
      problemResponse({ ...invalidParameters, errors: fieldErrors }),
    );
    expect(error).toBeInstanceOf(CriptonProblemError);
    expect(error).toMatchObject({ code: "invalid-parameters", status: 400 });
    expect(fieldErrorsOf(error)).toEqual(fieldErrors);
    expect(error.toJSON().details?.errors).toEqual(fieldErrors);
  });

  it("drops malformed field error entries", async () => {
    const error = await parseProblem(
      problemResponse({
        ...invalidParameters,
        errors: [{ field: 1, message: "x" }, "bad", { field: "a", message: "b" }],
      }),
    );
    expect(fieldErrorsOf(error)).toEqual([{ field: "a", message: "b" }]);
    expect(error.toJSON().details?.errors).toEqual([{ field: "a", message: "b" }]);
  });

  it("leaves errors undefined when the body has none", async () => {
    const error = await parseProblem(problemResponse(invalidParameters));
    expect(fieldErrorsOf(error)).toBeUndefined();
    expect(error.toJSON().details).not.toHaveProperty("errors");
  });
});
