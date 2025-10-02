import { buildProbeResponse } from "../shared/healthChecks";

export const handler = async (_evt: any, ctx: any) => {
  if (ctx && typeof ctx === "object") {
    ctx.callbackWaitsForEmptyEventLoop = false;
  }

  return buildProbeResponse(null, { endpoint: "liveness" });
};
