import * as t from 'io-ts';
import R from 'ramda';
import jwt from 'jsonwebtoken';
import pluralize from 'pluralize';
import cloneDeep from 'lodash/cloneDeep';
import cloneDeepWith from 'lodash/cloneDeepWith';
import { v4 as uuid } from 'uuid';
import { GaxiosError } from 'gaxios';
import { GoogleAuth } from 'google-auth-library';
import { Logger, NotFoundError, recoverP } from '@navch/common';
import { validate } from '@navch/codec';

import { resolveTemplateValue } from '../template/renderer';
import {
  WalletObject,
  WalletClass,
  WalletClassType,
  WalletObjectType,
  PassTemplateDefinition,
  PassCredentials,
} from './types';

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
  readonly forceUpdate: boolean;
};
export async function createWalletClass(req: CreateWalletClassRequest): Promise<WalletClass> {
  const { logger, client, classType, classInput, forceUpdate } = req;
  validate(classType, WalletClassType);

  const classId = validate(classInput.id, t.string);
  const payload = JSON.stringify({
    ...classInput,
    reviewStatus: 'underReview', // cannot be 'approved'
    review: {
      comments: 'Auto approval by system',
    },
  });

  return await recoverP(
    // Return the previously created wallet class if already exists
    getWalletClass({ logger, client, classType, classId }).then(async record => {
      if (!forceUpdate) return record;

      logger.debug('Update Google Wallet Class', { classType, payload });
      const { data } = await client.request({
        method: 'PUT',
        url: `https://walletobjects.googleapis.com/walletobjects/v1/${classType}/${classInput.id}`,
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: payload,
      });
      return data;
    }),
    // If no such wallet class found with the given ID
    NotFoundError,
    // Then create an new class with the given definition
    async function doCreate() {
      logger.debug('Create Google Wallet Class', { classType, payload });
      const { data } = await client.request({
        method: 'POST',
        url: `https://walletobjects.googleapis.com/walletobjects/v1/${classType}`,
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: payload,
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
   *
   * https://developers.google.com/pay/passes/guides/implement-the-api/save-passes-to-google-pay
   */
  readonly payload: Record<string, unknown>;
};
// https://developers.google.com/pay/passes/reference/s2w-reference
export async function signPayPassToken(req: SignPayPassTokenRequest) {
  const { logger, issuer, issuerKey, origins, payload } = req;
  const claims = {
    // The audience for Google Pay API for Passes Objects will always be 'google'.
    aud: 'google',
    // The audience for Google Pay API for Passes Objects will always be 'savetoandroidpay'.
    // Fucking Google: inconsistent documentation
    // typ: 'savetowallet',
    // typ: 'savetoandroidpay',
    typ: 'savetogooglepay',
    // Issued at time in seconds since epoch.
    iat: Math.floor(Date.now() / 1000),
    // Your OAuth 2.0 service account generated email address.
    iss: issuer,
    // Array of domains to approve for JWT saving functionality.
    origins,
    // The issued payload object.
    payload,
  };
  logger.debug('Sign Google Wallet JWT token', { claims });
  return jwt.sign(claims, issuerKey, { algorithm: 'RS256' });
}

export type CreateWalletPassRequest = {
  readonly logger: Logger;
  readonly template: PassTemplateDefinition;
  readonly credentials: PassCredentials;
  readonly barcode: string;
  readonly payload: Record<string, unknown>;
  readonly useSkinnyToken: boolean;
  readonly forceUpdate: boolean;
};
export async function createWalletPass(req: CreateWalletPassRequest): Promise<string> {
  const { logger, template, credentials, barcode, payload, forceUpdate, useSkinnyToken } = req;
  const { id, classType, classTemplate, objectType, objectTemplate } = template;
  const { issuerId } = credentials;

  logger.debug('Generate Google Pay Pass with decoded payload', { payload, useSkinnyToken });

  // Construct the PayPass class with the template if provided
  //
  const classRecord: WalletClass = {
    ...classTemplate,
    id: `${issuerId}.${id}`,
    reviewStatus: 'approved', // 'underReview',
  };

  // Construct the PayPass object with the decoded payload by substituting field
  // values in the generated pass with the input data.
  //
  const objectFields = R.mergeDeepRight(payload, {
    meta: {
      id: `${issuerId}.${uuid()}`,
      classId: classRecord.id,
      barcode,
      issuerId,
    },
  });
  const objectRecord: WalletObject = cloneDeepWith(cloneDeep(objectTemplate), key => {
    if (typeof key !== 'string') return undefined;
    return resolveTemplateValue(objectFields, key);
  });

  const client = new GoogleAuth({
    credentials: {
      client_email: credentials.certificates.clientEmail,
      private_key: credentials.certificates.clientSecret,
    },
    scopes: ['https://www.googleapis.com/auth/wallet_object.issuer'],
  });

  // Creates the defined `WalletClass`, which is always required for both API flow. The only
  // exception is COVID Card.
  //
  // https://developers.google.com/pay/passes/guides/introduction/typical-api-flows
  if (classType && classTemplate) {
    await createWalletClass({
      logger,
      client,
      classType,
      classInput: classRecord,
      forceUpdate,
    });
  }

  // Generate JWT token for "Save To Android Pay" button
  //
  // https://developers.google.com/pay/passes/guides/implement-the-api/save-passes-to-google-pay
  if (classType && classTemplate && useSkinnyToken) {
    const walletObject = await createWalletObject({
      logger,
      client,
      objectType,
      objectInput: { ...objectRecord, classId: classRecord.id },
    });
    return await signPayPassToken({
      logger,
      issuer: credentials.certificates.clientEmail,
      issuerKey: credentials.certificates.clientSecret,
      payload: {
        [pluralize(objectType)]: [{ id: walletObject.id }],
      },
    });
  } else {
    return await signPayPassToken({
      logger,
      issuer: credentials.certificates.clientEmail,
      issuerKey: credentials.certificates.clientSecret,
      payload: {
        [pluralize(objectType)]: [objectRecord],
        ...(classType && { [pluralize(classType)]: [classRecord] }),
      },
    });
  }
}
