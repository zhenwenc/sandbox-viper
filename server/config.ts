import * as t from 'io-ts';
import { validate } from '@navch/codec';
import { BaseConfig } from '@navch/common';

export class AppConfig extends BaseConfig {
  readonly port = this.readNumber('PORT', 3000);
}

export class ApplePassConfig extends BaseConfig {
  /**
   * The certificates used for signing the generated wallet pass, which can
   * be either a path to the PEM-formatted certificate file, or the PEM text.
   *
   * We demonstrate the use case of configure via environment variables.
   */
  readonly certificates = {
    wwdr: this.read('PASS_IOS_WWDR'),
    signerCert: this.read('PASS_IOS_SIGNER_CERT'),
    signerKey: {
      keyFile: this.read('PASS_IOS_SIGNER_KEY'),
      passphrase: this.read('PASS_IOS_SIGNER_KEY_PASS'),
    },
  };
  readonly teamIdentifier = this.read('PASS_IOS_TEAM_ID');
  readonly passTypeIdentifier = this.read('PASS_IOS_PASS_TYPE_ID');
}

export class GooglePayPassConfig extends BaseConfig {
  static credentialsSchema = t.type({
    type: t.literal('service_account'),
    project_id: t.string,
    private_key_id: t.string,
    private_key: t.string,
    client_id: t.string,
    client_email: t.string,
  });

  readonly issuerId = this.read('PASS_GOOGLE_PAY_ISSUER_ID');
  readonly credentials = (() => {
    const { credentialsSchema } = GooglePayPassConfig;
    const credentials = this.read('PASS_GOOGLE_GCP_CREDENTIALS');
    // You can download the service account credentials JSON file
    if (credentials.startsWith('{')) {
      return validate(JSON.parse(credentials), credentialsSchema);
    }
    return validate(require(credentials), credentialsSchema);
  })();
}
