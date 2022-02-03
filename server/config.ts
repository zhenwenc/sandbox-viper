import path from 'path';
import { BaseConfig } from '@navch/common';

export class AppConfig extends BaseConfig {
  readonly port = this.readNumber('PORT', 3000);

  /**
   * Location of the local pass bundles.
   *
   * TODO What's the better approach for NextJS?
   */
  readonly applePassTemplatesPath = path.resolve(__dirname, '../../../../assets/apple');
  readonly googlePassTemplatesPath = path.resolve(__dirname, '../../../../assets/google');
}
