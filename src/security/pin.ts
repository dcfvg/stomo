function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function derivePin(pin: string, salt: Uint8Array) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: salt as BufferSource,
      iterations: 75_000,
    },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export async function createPinHash(pin: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivePin(pin, salt);
  return { pinSalt: bytesToBase64(salt), pinHash: bytesToBase64(hash) };
}

export async function verifyPin(pin: string, pinSalt: string, pinHash: string) {
  if (!pinSalt || !pinHash) return false;
  const expected = base64ToBytes(pinHash);
  const actual = await derivePin(pin, base64ToBytes(pinSalt));
  if (expected.length !== actual.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1)
    difference |= expected[index] ^ actual[index];
  return difference === 0;
}
