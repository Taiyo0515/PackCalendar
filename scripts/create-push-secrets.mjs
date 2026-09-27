import { writeFile } from "node:fs/promises";
const pair = await crypto.subtle.generateKey(
  { name: "ECDSA", namedCurve: "P-256" },
  true,
  ["sign", "verify"],
);
const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
const values = {
  VAPID_PUBLIC_KEY: Buffer.from(
    await crypto.subtle.exportKey("raw", pair.publicKey),
  ).toString("base64url"),
  VAPID_PRIVATE_KEY: jwk.d,
  INVITATION_CODE: Buffer.from(
    crypto.getRandomValues(new Uint8Array(24)),
  ).toString("base64url"),
};
await writeFile("worker/.dev.vars.json", JSON.stringify(values, null, 2), {
  flag: "wx",
  mode: 0o600,
});
console.log(
  "Created worker/.dev.vars.json (gitignored). Keep this private; use Wrangler secret bulk to upload.",
);
