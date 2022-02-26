import * as t from 'io-ts';
import cbor from 'cbor';
import { pki } from 'node-forge';
import { JWK, JWE } from 'node-jose'; // TODO replace with `jose`
import { promisify } from 'util';
import { generateKeyPair } from 'crypto';

import { BadRequestError, InternalServerError } from '@navch/common';
import { validate } from '@navch/codec';

const generateKeyPairAsync = promisify(generateKeyPair);

export type KeyPair = t.TypeOf<typeof KeyPair>;
export const KeyPair = t.type({
  publicKey: t.string,
  privateKey: t.string,
  passphrase: t.union([t.string, t.undefined]),
});

export async function generateRsaKeyPair(): Promise<KeyPair> {
  try {
    //
    // Ref: https://coolaj86.com/articles/rsa-vs-ecdsa/
    //
    // - Both are equally secure (for all existing known mathematics)
    // - EC has smaller keys, faster keygen, but slower sign/verify (and encrypt/decrypt)
    // - RSA has much larger keys, much slower keygen, but faster sign/verify (and encrypt/decrypt)
    //
    const { publicKey, privateKey } = await generateKeyPairAsync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem',
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem',
      },
    });
    //
    // NOTE: `node-jose` does not support private key with passphrase
    // https://github.com/cisco/node-jose/issues/69
    //
    return { publicKey, privateKey, passphrase: undefined };
  } catch (err) {
    err.message = `Failed to generate RSA keypair: ${err.message}`;
    throw new InternalServerError(err);
  }
}

export async function toX509Cert(keypair: KeyPair, passphrase?: string): Promise<KeyPair> {
  try {
    const privateKey = pki.privateKeyFromPem(keypair.privateKey);

    const cert = pki.createCertificate();
    cert.publicKey = pki.publicKeyFromPem(keypair.publicKey);
    cert.sign(privateKey);

    const publicKeyPem = pki.certificateToPem(cert);
    const privateKeyPem = passphrase
      ? pki.encryptRsaPrivateKey(privateKey, passphrase, { algorithm: 'aes128' })
      : pki.privateKeyToPem(privateKey);

    return { publicKey: publicKeyPem, privateKey: privateKeyPem, passphrase };
  } catch (err) {
    err.message = `Failed to encode keypair: ${err.message}`;
    throw new InternalServerError(err);
  }
}

export async function encrypt<A>(secret: KeyPair, message: A): Promise<string> {
  const { publicKey } = secret;
  try {
    const key = await JWK.asKey(publicKey, 'pem');
    const payload = await cbor.encodeAsync(message);
    return await JWE.createEncrypt({ format: 'compact' }, key).update(payload).final();
  } catch (err) {
    err.message = `Failed to encrypt secret message: ${err.message}`;
    throw new InternalServerError(err);
  }
}

export async function decrypt<A, O = A>(secret: KeyPair, input: string, codec: t.Type<A, O>): Promise<A> {
  const { privateKey } = secret;
  try {
    const key = await JWK.asKey(privateKey, 'pem');
    const decrypted = await JWE.createDecrypt(key).decrypt(input);
    return validate(await cbor.decodeFirst(decrypted.payload), codec);
  } catch (err) {
    err.message = `Invalid secret: ${err.message}`;
    throw new BadRequestError(err);
  }
}
