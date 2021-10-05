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

export class GooglePayPassConfig extends BaseConfig {
  readonly issuerId = this.read('PASS_GOOGLE_PAY_ISSUER_ID');

  readonly credentials = (() => {
    const credentials = this.read('PASS_GOOGLE_GCP_CREDENTIALS');
    // You can download the service account credentials JSON file
    if (credentials.startsWith('{')) {
      return validate(JSON.parse(credentials), GoogleCredentials);
    }
    return validate(require(credentials), GoogleCredentials);
  })();
}
