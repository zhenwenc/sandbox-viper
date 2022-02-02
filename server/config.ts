import * as t from 'io-ts';
import path from 'path';
import { validate } from '@navch/codec';
import { BaseConfig } from '@navch/common';

export class AppConfig extends BaseConfig {
  readonly port = this.readNumber('PORT', 3000);

  /**
   * Location of the local pass bundles.
   *
   * TODO What's the better approach for NextJS?
   */
  readonly bundlesPath = path.resolve(__dirname, '../../../../assets');
}

export class ApplePassConfig extends AppConfig {
  /**
   * The certificates used for signing the generated wallet pass, which can
   * be either a path to the PEM-formatted certificate file, or the PEM text.
   *
   * We demonstrate the use case of configure via environment variables.
   */
  readonly certificates = {
    wwdr: this.read('APPLE_PASS_WWDR'),
    signerCert: this.read('APPLE_PASS_SIGNER_CERT'),
    signerKey: {
      keyFile: this.read('APPLE_PASS_SIGNER_KEY'),
      passphrase: this.read('APPLE_PASS_SIGNER_PASSPHRASE'),
    },
  };
  readonly teamIdentifier = this.read('APPLE_PASS_TEAM_ID');
  readonly passTypeIdentifier = this.read('APPLE_PASS_TYPE_ID');
}

export class GooglePayPassConfig extends AppConfig {
  static credentialsSchema = t.type({
    type: t.literal('service_account'),
    project_id: t.string,
    private_key: t.string,
    private_key_id: t.string,
    client_id: t.string,
    client_email: t.string,
  });

  readonly issuerId = this.read('GOOGLE_PASS_PAY_ISSUER_ID');
  readonly credentials = (() => {
    const { credentialsSchema } = GooglePayPassConfig;
    const credentials = this.read('GOOGLE_PASS_GCP_CREDENTIALS');
    // You can download the service account credentials JSON file
    if (credentials.startsWith('{')) {
      return validate(JSON.parse(credentials), credentialsSchema);
    }
    return validate(require(credentials), credentialsSchema);
  })();
}
