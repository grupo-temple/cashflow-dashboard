import { describe, it, expect, beforeAll } from "vitest";
import { encrypt, decrypt } from "./field-encrypt";

const TEST_KEY = "a".repeat(64); // 64 hex chars = 32 bytes

beforeAll(() => {
  process.env.FIELD_ENCRYPTION_KEY = TEST_KEY;
});

describe("field-encrypt", () => {
  it("round-trip: decrypt(encrypt(x)) === x", () => {
    const plain = "super-secret-api-key-12345";
    expect(decrypt(encrypt(plain))).toBe(plain);
  });

  it("encrypts to different ciphertext each call (random IV)", () => {
    const plain = "same-plaintext";
    expect(encrypt(plain)).not.toBe(encrypt(plain));
  });

  it("decrypts correctly for arbitrary unicode values", () => {
    const plain = "clave-con-ñ-y-acentos-🔑";
    expect(decrypt(encrypt(plain))).toBe(plain);
  });

  it("throws when FIELD_ENCRYPTION_KEY is missing", () => {
    const orig = process.env.FIELD_ENCRYPTION_KEY;
    delete process.env.FIELD_ENCRYPTION_KEY;
    expect(() => encrypt("x")).toThrow("FIELD_ENCRYPTION_KEY");
    process.env.FIELD_ENCRYPTION_KEY = orig;
  });

  it("throws on tampered ciphertext", () => {
    const enc = encrypt("hello");
    const buf = Buffer.from(enc, "base64");
    buf[20] ^= 0xff; // flip a byte in the ciphertext
    expect(() => decrypt(buf.toString("base64"))).toThrow();
  });
});
