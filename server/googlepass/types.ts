import * as t from 'io-ts';

export type WalletObjectType = t.TypeOf<typeof WalletObjectType>;
export const WalletObjectType = t.union([
  t.literal('covidCardObject'),
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
export const WalletClass = t.intersection([
  t.record(t.string, t.unknown), // allow unknown properties
  t.partial({
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
     * You should set this field to `underReview` when you believe the class is ready for
     * use. The platform will automatically set this field to `approved` and it can be
     * immediately used to create or migrate objects.
     *
     * When updating an already `approved` class you should keep setting this field to
     * be `underReview`.
     */
    reviewStatus: t.union([t.literal('draft'), t.literal('approved'), t.literal('underReview')]),
  }),
]);

export type WalletObject = t.TypeOf<typeof WalletObject>;
export const WalletObject = t.intersection([
  t.record(t.string, t.unknown), // allow unknown properties
  t.type({
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
    classId: t.union([t.string, t.undefined]),
    /**
     * The lazily created wallet object class for the skinny JWT flow, or to a copy
     * of the inherited fields of the parent class.
     */
    classReference: t.union([t.unknown, t.undefined]),
  }),
]);

/**
 * Represents template data model used for generating passes (Google Pay URL).
 *
 * https://developers.google.com/pay/passes/rest/v1/offerclass
 */
export type PassTemplateDefinition = t.TypeOf<typeof PassTemplateDefinition>;
export const PassTemplateDefinition = t.type({
  /**
   * Unique identifier, only used for predefined templates.
   */
  id: t.string,
  /**
   * Brief description of the template, used for the companion GUI tool.
   */
  description: t.string,
  classType: t.union([WalletClassType, t.undefined]),
  classTemplate: t.union([WalletClass, t.undefined]),
  objectType: WalletObjectType,
  objectTemplate: WalletObject,
});

/**
 * The GCP service account credentials for signing the generated JWT token. You must
 * enable Google Pay API for "skinny JWT token".
 *
 * ```
 * static gcpCredentialsSchema = t.type({
 *   type: t.literal('service_account'),
 *   project_id: t.string,
 *   private_key: t.string,
 *   private_key_id: t.string,
 *   client_id: t.string,
 *   client_email: t.string,
 * });
 * ```
 */
export type PassCredentials = t.TypeOf<typeof PassCredentials>;
export const PassCredentials = t.type({
  issuerId: t.string,
  certificates: t.type({
    clientEmail: t.string, // client_email
    clientSecret: t.string, // private_key
  }),
});
