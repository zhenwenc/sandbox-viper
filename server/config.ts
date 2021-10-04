import * as t from 'io-ts';
import { validate } from '@navch/codec';
import { BaseConfig } from '@navch/common';

const GoogleCredentials = t.type({
  type: t.literal('service_account'),
  project_id: t.string,
  private_key_id: t.string,
  private_key: t.string,
  client_id: t.string,
  client_email: t.string,
});

export class AppConfig extends BaseConfig {
  get googleCredentials() {
    const credentials = this.read('GCP_CREDENTIALS');
    if (credentials.startsWith('{')) {
      return validate(JSON.parse(credentials), GoogleCredentials);
    }
    return validate(require(credentials), GoogleCredentials);
  }

  readonly googlePass = {
    issuerId: this.read('PASS_GOOGLE_PAY_ISSUER_ID', '3388000000018600875'),
    loyaltyProgram: this.read('PASS_GOOGLE_LOYALTY_PROGRAM', 'codelab-demo'),
  };
}
