import * as t from 'io-ts';

export const PassModelBarcode = t.type({
  format: t.union([
    t.literal('PKBarcodeFormatQR'),
    t.literal('PKBarcodeFormatPDF417'),
    t.literal('PKBarcodeFormatAztec'),
    t.literal('PKBarcodeFormatCode128'),
  ]),
  message: t.string,
  messageEncoding: t.literal('iso-8859-1'),
  altText: t.union([t.string, t.undefined]),
});

export const PassModelLocation = t.type({
  latitude: t.number,
  longitude: t.number,
});

export const PassModelField = t.type({
  key: t.string,
  value: t.string,
  label: t.string,
});

export const PassModel = t.type({
  formatVersion: t.literal(1),
  /**
   * The team identifier is a series of letters and numbers issued to you by Apple.
   * The value for the teamIdentifier key in the pass specifies the team identifier.
   * It must match the Team ID of the certificate used to sign the pass.
   */
  teamIdentifier: t.union([t.string, t.undefined]),
  /**
   * The value for the passTypeIdentifier key specifies the pass type identifier. It
   * is a string you choose to define a class or category of passes. It always begins
   * with `pass.` and uses reverse DNS style.
   */
  passTypeIdentifier: t.union([t.string, t.undefined]),
  /**
   * The description lets VoiceOver make your pass accessible to blind and low-vision
   * users. The value for the `description` key in the pass specifies the description.
   * The description should start with a high-level term such as "Membership card", or
   * "Bus ticket" followed by one or two small pieces of information.
   */
  description: t.union([t.string, t.undefined]),
  /**
   * The organization name is displayed on the lock screen when your pass is relevant
   * and by apps such as Mail which act as a conduit for passes. The value for the
   * `organizationName` key in the pass specifies the organization name.
   */
  organizationName: t.union([t.string, t.undefined]),
  /**
   * The serial number is a string that uniquely identifies the pass within the scope
   * of its pass type. The value for the `serialNumber` key in the pass specifies the
   * serial number, which is opaque to PassKit.
   */
  serialNumber: t.union([t.string, t.undefined]),
  webServiceURL: t.union([t.string, t.undefined]),
  authenticationToken: t.union([t.string, t.undefined]),
  relevantDate: t.union([t.string, t.undefined]),
  foregroundColor: t.union([t.string, t.undefined]),
  backgroundColor: t.union([t.string, t.undefined]),
  barcode: t.union([PassModelBarcode, t.undefined]),
  locations: t.union([t.array(PassModelLocation), t.undefined]),
});

export type PassImageDefinition = t.TypeOf<typeof PassImageDefinition>;
export const PassImageDefinition = t.type({
  /**
   * Data URL of the image. Only PNG image is supported.
   *
   * @example
   * ```
   * { "url": "data:image/png;base64,iVBOR...gg==" }
   * ```
   */
  url: t.string,
});

/**
 * Pass styles and relevant image types:
 *
 * | Pass style    | Supported images                         |
 * |---------------|------------------------------------------|
 * | Boarding pass | logo, icon, footer                       |
 * | Coupon        | logo, icon, strip                        |
 * | Event ticket  | logo, icon, strip, background, thumbnail |
 * | Generic       | logo, icon, thumbnail                    |
 * | Store card    | logo, icon, strip                        |
 *
 * See the offial Apple Pass design guide for details.
 */
export type PassImageDefinitions = t.TypeOf<typeof PassImageDefinitions>;
export const PassImageDefinitions = t.partial({
  /**
   * The logo image is displayed in the top left corner of the pass beside the logo
   * text.
   *
   * The allotted space is 320 x 100 points; in most cases it should be more narrow.
   */
  logo: PassImageDefinition,
  /**
   * The icon image is displayed when a pass is shown on the lock screen and by apps
   * such as Mail when the pass is attached to an email.
   *
   * The icon should have dimensions of 58 x 58 points.
   */
  icon: PassImageDefinition,
  /**
   * The strip image strip.png is displayed behind the primary fields. The expected
   * dimensions are 640 x 168-246 points. The allotted space is 640 x 168 points for
   * event tickets; 640 x 220 points for other pass styles with a square barcode on
   * devices with 3.5 inch screens; 640 x 246 for all other uses.
   */
  strip: PassImageDefinition,
  /**
   * The footer image is displayed near the barcode.
   *
   * The allotted space is 572 x 30 points.
   */
  footer: PassImageDefinition,
  /**
   * The background image is displayed behind the entire front side of the pass. The
   * expected dimensions are 360 x 440 points. The image is slightly cropped on all
   * sides and also blurred.
   *
   * You can often provide an image at a smaller size. It will be scaled up, but the
   * blurring effect will hide the details of the image. This lets you reduce the file
   * size without users noticing the difference.
   */
  background: PassImageDefinition,
  /**
   * The thumbnail image thumbnail.png is displayed next to the fields on the front
   * side of the pass. The allotted space is 120-180 x 120-180 points. The aspect
   * ratio should be in the range of 2:3 to 3:2 or the image will be cropped.
   */
  thumbnail: PassImageDefinition,
});

/**
 * Represents template data model used for generating passes (PKPASS file).
 *
 * TODO support translations
 */
export type PassTemplateDefinition = t.TypeOf<typeof PassTemplateDefinition>;
export const PassTemplateDefinition = t.strict({
  /**
   * Unique identifier, mainly used for predefined templates.
   */
  id: t.string,
  /**
   * Pass appearance definition, layout, fields, barcodes and other pass properties.
   */
  model: PassModel,
  /**
   * List of images attaching to the pass. See template layout design for details.
   */
  images: PassImageDefinitions,
});

/**
 * The credentials for signing the generated Apple Pass, must be PEM text.
 *
 * See `passkit-generator` docs for details to generate the certificates.
 */
export type PassCredentials = t.TypeOf<typeof PassCredentials>;
export const PassCredentials = t.type({
  teamIdentifier: t.string,
  passTypeIdentifier: t.string,
  certificates: t.type({
    wwdr: t.string,
    signerCert: t.string,
    signerKey: t.type({
      keyFile: t.string,
      passphrase: t.string,
    }),
  }),
});
