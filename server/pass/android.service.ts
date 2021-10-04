import * as t from 'io-ts';
import jwt from 'jsonwebtoken';
import pluralize from 'pluralize';
import { GaxiosError } from 'gaxios';
import { GoogleAuth } from 'google-auth-library';
import { Logger, NotFoundError, recoverP } from '@navch/common';
import { validate } from '@navch/codec';

export type WalletObjectType = t.TypeOf<typeof WalletObjectType>;
export const WalletObjectType = t.union([
  t.literal('eventTicketObject'),
  t.literal('flightObject'),
  t.literal('giftCardObject'),
  t.literal('loyaltyObject'),
  t.literal('offerObject'),
  t.literal('transitObject'),
]);

export type WalletClassType = t.TypeOf<typeof WalletClassType>;
export const WalletClassType = t.union([
  t.literal('eventTicketClass'),
  t.literal('flightClass'),
  t.literal('giftCardClass'),
  t.literal('loyaltyClass'),
  t.literal('offerClass'),
  t.literal('transitClass'),
]);

export type WalletClass = t.TypeOf<typeof WalletClass>;
export const WalletClass = t.type({
  /**
   * An unique identifier for this Google Pay Wallet Pass class.
   */
  id: t.string,
  /**
   * The status of the class. This field can be set to `draft` or `underReview` using
   * the insert, patch, or update API calls. Once the review state is changed from
   * draft it may not be changed back to draft.
   *
   * You should keep this field to `draft` when the class is under development. A draft
   * class cannot be used to create any object.
   *
   * You should set this field to underReview when you believe the class is ready for
   * use. The platform will automatically set this field to `approved` and it can be
   * immediately used to create or migrate objects.
   *
   * When updating an already `approved` class you should keep setting this field to
   * `underReview`.
   */
  reviewStatus: t.union([t.literal('draft'), t.literal('approved'), t.literal('underReview')]),
});

export type WalletObject = t.TypeOf<typeof WalletObject>;
export const WalletObject = t.type({
  /**
   * An unique identifier for this Google Pay Wallet Pass object. Must follow
   * this format: `issuerId.identifier` where `identifier` should be the same
   * as the subject's identifier, such as `accountId` for Loyalty Pass.
   *
   * There are character restrictions for this value. TODO
   */
  id: t.string,
  /**
   * The class associated with this object. The class must be of the same type as
   * this object, must already exist, and must be approved.
   *
   * Class IDs should follow the format `issuer_id.identifier` where the former is
   * issued by Google and latter is chosen by you.
   */
  classId: t.string,
  /**
   * The lazily created wallet object class for the skinny JWT flow, or to a copy
   * of the inherited fields of the parent class.
   */
  classReference: t.union([t.unknown, t.undefined]),
});

export type ListWalletClassRequest = {
  readonly logger: Logger;
  readonly client: GoogleAuth;
  readonly issuerId: string;
  readonly objectType: WalletClassType;
};
export async function listWalletClass(req: ListWalletClassRequest): Promise<WalletClass[]> {
  const { logger, client, issuerId, objectType } = req;
  logger.debug(`List all Google Wallet Classes`, { issuerId });

  try {
    const { data } = await client.request({
      method: 'GET',
      params: { issuerId },
      url: `https://walletobjects.googleapis.com/walletobjects/v1/${objectType}`,
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    });
    return data;
  } catch (err) {
    if (err instanceof GaxiosError && err.response?.status === 404) {
      throw new NotFoundError(err);
    }
    throw err;
  }
}

export type GetWalletClassRequest = {
  readonly logger: Logger;
  readonly client: GoogleAuth;
  readonly classType: WalletClassType;
  readonly classId: string;
};
export async function getWalletClass(req: GetWalletClassRequest): Promise<WalletClass> {
  const { logger, client, classType, classId } = req;
  logger.debug(`Fetch Google Wallet Class`, { classType, classId });
  validate(classType, WalletClassType);

  try {
    const { data } = await client.request({
      method: 'GET',
      url: `https://walletobjects.googleapis.com/walletobjects/v1/${classType}/${classId}`,
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    });
    return data;
  } catch (err) {
    if (err instanceof GaxiosError && err.response?.status === 404) {
      throw new NotFoundError(err);
    }
    throw err;
  }
}

export type CreateWalletClassRequest = {
  readonly logger: Logger;
  readonly client: GoogleAuth;
  readonly classType: WalletClassType;
  readonly classInput: WalletClass;
  readonly forceUpdate?: boolean;
};
export async function createWalletClass(req: CreateWalletClassRequest): Promise<WalletClass> {
  const { logger, client, classType, classInput, forceUpdate } = req;
  validate(classType, WalletClassType);

  return await recoverP(
    // Return the previously created wallet class if already exists
    getWalletClass({ logger, client, classType, classId: classInput.id }).then(async record => {
      if (!forceUpdate) return record;

      logger.debug('Update Google Wallet Class', { classType, classId: classInput.id });
      const { data } = await client.request({
        method: 'PUT',
        url: `https://walletobjects.googleapis.com/walletobjects/v1/${classType}/${classInput.id}`,
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(classInput),
      });
      return data;
    }),
    // If no such wallet class found with the given ID
    NotFoundError,
    // Then create an new class with the given definition
    async function doCreate() {
      logger.debug('Create Google Wallet Class', { classType, classId: classInput.id });
      const { data } = await client.request({
        method: 'POST',
        url: `https://walletobjects.googleapis.com/walletobjects/v1/${classType}`,
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(classInput),
      });
      return data;
    }
  );
}

export type GetWalletObjectRequest = {
  readonly logger: Logger;
  readonly client: GoogleAuth;
  readonly objectType: WalletObjectType;
  readonly objectId: string;
};
export async function getWalletObject(req: GetWalletObjectRequest): Promise<WalletObject> {
  const { logger, client, objectType, objectId } = req;
  logger.debug(`Fetch Google Wallet Object`, { objectType, objectId });
  validate(objectType, WalletObjectType);

  try {
    const { data } = await client.request({
      method: 'GET',
      url: `https://walletobjects.googleapis.com/walletobjects/v1/${objectType}/${objectId}`,
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    });
    return data;
  } catch (err) {
    if (err instanceof GaxiosError && err.response?.status === 404) {
      throw new NotFoundError(err);
    }
    throw err;
  }
}

export type CreateWalletObjectRequest = {
  readonly logger: Logger;
  readonly client: GoogleAuth;
  readonly objectType: WalletObjectType;
  readonly objectInput: WalletObject;
};
export async function createWalletObject(req: CreateWalletObjectRequest): Promise<WalletObject> {
  const { logger, client, objectType, objectInput } = req;
  validate(objectType, WalletObjectType);

  return await recoverP(
    // Return the previously created wallet object if already exists
    getWalletObject({ logger, client, objectType, objectId: objectInput.id }),
    // If no such wallet object found with the given ID
    NotFoundError,
    // Then create an new object with the given payload
    async function doCreate() {
      logger.debug('Create Google Wallet Object', { objectType, objectId: objectInput.id });
      const { data } = await client.request({
        method: 'POST',
        url: `https://walletobjects.googleapis.com/walletobjects/v1/${objectType}`,
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(objectInput),
      });
      return data;
    }
  );
}

export type SignPayPassTokenRequest = {
  readonly logger: Logger;
  /**
   * Service account email address.
   */
  readonly issuer: string;
  /**
   * Service account private key.
   */
  readonly issuerKey: string;
  /**
   * An array of domains to approve for JWT saving functionality. The Google Pay
   * API for Passes button will not render when the origins field is not defined.
   * You could potentially get an "Load denied by X-Frame-Options" or "Refused to display"
   * messages in the browser console when the origins field is not defined.
   */
  readonly origins?: readonly string[];
  /**
   * An array of classes/objects to save.
   */
  readonly records: { readonly id: string }[];
  readonly recordType: WalletObjectType;
};
// https://developers.google.com/pay/passes/reference/s2w-reference
export async function signPayPassToken(req: SignPayPassTokenRequest) {
  const { logger, issuer, issuerKey, origins, records, recordType } = req;
  const claims = {
    // The audience for Google Pay API for Passes Objects will always be 'google'.
    aud: 'google',
    // The audience for Google Pay API for Passes Objects will always be 'savetoandroidpay'.
    typ: 'savetoandroidpay',
    // Issued at time in seconds since epoch.
    iat: Math.floor(Date.now() / 1000),
    // Your OAuth 2.0 service account generated email address.
    iss: issuer,
    // Array of domains to approve for JWT saving functionality.
    origins,
    // The issued payload object.
    // https://developers.google.com/pay/passes/guides/implement-the-api/save-passes-to-google-pay
    payload: { [pluralize(recordType)]: records.map(item => ({ id: item.id })) },
  };
  logger.debug('Sign Google Wallet JWT token', { recordType, claims });
  return jwt.sign(claims, issuerKey, { algorithm: 'RS256' });
}
