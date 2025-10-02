import { buildProbeResponse, runReadinessChecks } from "../shared/healthChecks";

export const handler = async (_evt: any, ctx: any) => {
  if (ctx && typeof ctx === "object") {
    ctx.callbackWaitsForEmptyEventLoop = false;
  }

  const result = await runReadinessChecks();

  return buildProbeResponse(result, { endpoint: "readiness" });
};
