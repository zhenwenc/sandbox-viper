import path from 'path';
import memoize from 'memoizee';
import { BaseConfig } from '@navch/common';

import { KeyPair, generateRsaKeyPair } from './secret';

export class AppConfig extends BaseConfig {
  constructor() {
    super();
    this.getServerCerts = memoize(this.getServerCerts.bind(this));
  }

  readonly port = this.readNumber('PORT', 3000);

  readonly redisURI = this.read('REDIS_URI', null);

  /**
   * Location of the local pass bundles.
   *
   * TODO What's the better approach for NextJS?
   */
  readonly applePassTemplatesPath = path.resolve(__dirname, '../../../../assets/apple');
  readonly googlePassTemplatesPath = path.resolve(__dirname, '../../../../assets/google');

  async getServerCerts(): Promise<KeyPair> {
    const secret = {
      publicKey: this.read('SERVER_PUBLIC_KEY', null),
      privateKey: this.read('SERVER_PRIVATE_KEY', null),
    };
    return KeyPair.is(secret) ? secret : await generateRsaKeyPair();
  }
}
