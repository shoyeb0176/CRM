// Self-check for src/lib/crypto.server.ts.  Run: bun scripts/selftest-crypto.ts
import assert from "node:assert/strict";
import { decryptSecret, encryptSecret, isEncrypted } from "../src/lib/crypto.server";

const keyA = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
const keyB = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));

// No key configured: stored as-is (legacy behaviour), and read back as-is.
delete process.env.APP_ENCRYPTION_KEY;
assert.equal(await encryptSecret("sk-plain"), "sk-plain");
assert.equal(await decryptSecret("sk-plain"), "sk-plain");

// With a key: round trip, random IV each time, legacy plaintext still readable.
process.env.APP_ENCRYPTION_KEY = keyA;
const c1 = await encryptSecret("sk-secret-123");
const c2 = await encryptSecret("sk-secret-123");
assert.ok(isEncrypted(c1) && c1 !== c2 && !c1.includes("sk-secret"));
assert.equal(await decryptSecret(c1), "sk-secret-123");
assert.equal(await decryptSecret("legacy-plain"), "legacy-plain");

// Wrong or missing key: a clear error, never garbage.
process.env.APP_ENCRYPTION_KEY = keyB;
await assert.rejects(decryptSecret(c1), /APP_ENCRYPTION_KEY has changed/);
delete process.env.APP_ENCRYPTION_KEY;
await assert.rejects(decryptSecret(c1), /APP_ENCRYPTION_KEY is not set/);

// Bad key length is rejected.
process.env.APP_ENCRYPTION_KEY = btoa("short");
await assert.rejects(encryptSecret("x"), /32 bytes/);

console.log("crypto self-test: ok");
