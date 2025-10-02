var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/handlers/authStripeStart.ts
var authStripeStart_exports = {};
__export(authStripeStart_exports, {
  handler: () => handler
});
module.exports = __toCommonJS(authStripeStart_exports);
var import_crypto = __toESM(require("crypto"));

// src/shared/responses.ts
var securityHeaders = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization,Content-Type,X-Requested-With,X-Request-ID",
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
  "Access-Control-Allow-Credentials": "true",
  // Security headers
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://www.gstatic.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://api.stripe.com https://*.firebaseio.com",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=*, usb=()"
};
var bad = (msg) => ({
  statusCode: 400,
  headers: securityHeaders,
  body: JSON.stringify({ error: msg })
});

// src/handlers/authStripeStart.ts
var STRIPE_CLIENT_ID = process.env.STRIPE_CLIENT_ID;
var STRIPE_REDIRECT_URI = process.env.STRIPE_REDIRECT_URI;
async function handler(event) {
  if (!STRIPE_CLIENT_ID || !STRIPE_REDIRECT_URI)
    return bad("Stripe not configured");
  const qs = event.queryStringParameters || {};
  const firebase_uid = qs.uid || qs.firebase_uid || null;
  const stateData = {
    firebase_uid,
    csrf: import_crypto.default.randomBytes(16).toString("hex"),
    timestamp: Date.now()
  };
  const state = Buffer.from(JSON.stringify(stateData)).toString("base64");
  const params = new URLSearchParams({
    response_type: "code",
    client_id: STRIPE_CLIENT_ID,
    scope: "read_write",
    redirect_uri: STRIPE_REDIRECT_URI,
    state
  }).toString();
  return {
    statusCode: 302,
    headers: {
      "Location": `https://connect.stripe.com/oauth/authorize?${params}`,
      "Cache-Control": "no-cache, no-store, must-revalidate"
    },
    body: ""
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
