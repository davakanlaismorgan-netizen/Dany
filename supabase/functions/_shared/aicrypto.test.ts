import assert from "node:assert/strict";
import { CryptoConfigError, decryptKey, encryptKey, importMasterKey } from "./aicrypto.ts";

const secret = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));
const U1 = "aaaaaaaa-0000-0000-0000-00000000000a";
const U2 = "bbbbbbbb-0000-0000-0000-00000000000b";

Deno.test("aller-retour : le texte chiffré ne contient pas la clé", async () => {
  const k = await importMasterKey(secret);
  const stored = await encryptKey(k, U1, "sk-ant-SECRET-1234567890abcdef");
  assert.ok(stored.startsWith("v1."));
  assert.ok(!stored.includes("SECRET"));
  assert.equal(await decryptKey(k, U1, stored), "sk-ant-SECRET-1234567890abcdef");
});

Deno.test("deux chiffrements du même texte diffèrent (IV aléatoire)", async () => {
  const k = await importMasterKey(secret);
  assert.notEqual(await encryptKey(k, U1, "x".repeat(30)), await encryptKey(k, U1, "x".repeat(30)));
});

Deno.test("recopié sur un autre utilisateur : refus", async () => {
  const k = await importMasterKey(secret);
  const stored = await encryptKey(k, U1, "k".repeat(30));
  assert.equal(await decryptKey(k, U2, stored), null);
});

Deno.test("texte altéré, mauvais format ou mauvaise clé maîtresse : null", async () => {
  const k = await importMasterKey(secret);
  const stored = await encryptKey(k, U1, "k".repeat(30));
  const parts = stored.split(".");
  assert.equal(await decryptKey(k, U1, `${parts[0]}.${parts[1]}.${parts[2].slice(0, -2)}AA`), null);
  assert.equal(await decryptKey(k, U1, "n'importe quoi"), null);
  assert.equal(await decryptKey(k, U1, "v2.a.b"), null);
  const other = await importMasterKey(btoa(String.fromCharCode(...new Uint8Array(32).fill(9))));
  assert.equal(await decryptKey(other, U1, stored), null);
});

Deno.test("secret absent, invalide ou de mauvaise longueur : CryptoConfigError", async () => {
  for (const s of [undefined, "", "pas du base64 !!", btoa("trop court")]) {
    await assert.rejects(() => importMasterKey(s), CryptoConfigError);
  }
});
