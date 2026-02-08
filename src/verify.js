import { createHmac } from "crypto";

export function verifySentrySignature(body, signature, secret) {
  const hmac = createHmac("sha256", secret);
  hmac.update(body, "utf8");
  const digest = hmac.digest("hex");
  return digest === signature;
}
