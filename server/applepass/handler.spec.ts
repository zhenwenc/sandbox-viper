import yauzl from 'yauzl';
import setPath from 'lodash/set';
import { SignJWT } from 'jose';
import { randomBytes } from 'crypto';
import supertest, { Test, SuperTest, Response } from 'supertest';

import { Logger, LoggerLevel, HttpStatus } from '@navch/common';
import { makeRouter, middlewares, setRequestContext } from '@navch/http';

import { buildInMemoryStorage } from '../storage';
import { buildApplePassHandlers } from './handler';
import { buildDecoders } from '../decoder/service';
import { generateRsaKeyPair, toX509Cert } from '../secret';
import { PassCredentials } from './types';

const APPLE_PASS_WWDR =
  '-----BEGIN CERTIFICATE-----\n' +
  'MIIEIjCCAwqgAwIBAgIIAd68xDltoBAwDQYJKoZIhvcNAQEFBQAwYjELMAkGA1UE\n' +
  'BhMCVVMxEzARBgNVBAoTCkFwcGxlIEluYy4xJjAkBgNVBAsTHUFwcGxlIENlcnRp\n' +
  'ZmljYXRpb24gQXV0aG9yaXR5MRYwFAYDVQQDEw1BcHBsZSBSb290IENBMB4XDTEz\n' +
  'MDIwNzIxNDg0N1oXDTIzMDIwNzIxNDg0N1owgZYxCzAJBgNVBAYTAlVTMRMwEQYD\n' +
  'VQQKDApBcHBsZSBJbmMuMSwwKgYDVQQLDCNBcHBsZSBXb3JsZHdpZGUgRGV2ZWxv\n' +
  'cGVyIFJlbGF0aW9uczFEMEIGA1UEAww7QXBwbGUgV29ybGR3aWRlIERldmVsb3Bl\n' +
  'ciBSZWxhdGlvbnMgQ2VydGlmaWNhdGlvbiBBdXRob3JpdHkwggEiMA0GCSqGSIb3\n' +
  'DQEBAQUAA4IBDwAwggEKAoIBAQDKOFSmy1aqyCQ5SOmM7uxfuH8mkbw0U3rOfGOA\n' +
  'YXdkXqUHI7Y5/lAtFVZYcC1+xG7BSoU+L/DehBqhV8mvexj/avoVEkkVCBmsqtsq\n' +
  'Mu2WY2hSFT2Miuy/axiV4AOsAX2XBWfODoWVN2rtCbauZ81RZJ/GXNG8V25nNYB2\n' +
  'NqSHgW44j9grFU57Jdhav06DwY3Sk9UacbVgnJ0zTlX5ElgMhrgWDcHld0WNUEi6\n' +
  'Ky3klIXh6MSdxmilsKP8Z35wugJZS3dCkTm59c3hTO/AO0iMpuUhXf1qarunFjVg\n' +
  '0uat80YpyejDi+l5wGphZxWy8P3laLxiX27Pmd3vG2P+kmWrAgMBAAGjgaYwgaMw\n' +
  'HQYDVR0OBBYEFIgnFwmpthhgi+zruvZHWcVSVKO3MA8GA1UdEwEB/wQFMAMBAf8w\n' +
  'HwYDVR0jBBgwFoAUK9BpR5R2Cf70a40uQKb3R01/CF4wLgYDVR0fBCcwJTAjoCGg\n' +
  'H4YdaHR0cDovL2NybC5hcHBsZS5jb20vcm9vdC5jcmwwDgYDVR0PAQH/BAQDAgGG\n' +
  'MBAGCiqGSIb3Y2QGAgEEAgUAMA0GCSqGSIb3DQEBBQUAA4IBAQBPz+9Zviz1smwv\n' +
  'j+4ThzLoBTWobot9yWkMudkXvHcs1Gfi/ZptOllc34MBvbKuKmFysa/Nw0Uwj6OD\n' +
  'Dc4dR7Txk4qjdJukw5hyhzs+r0ULklS5MruQGFNrCk4QttkdUGwhgAqJTleMa1s8\n' +
  'Pab93vcNIx0LSiaHP7qRkkykGRIZbVf1eliHe2iK5IaMSuviSRSqpd1VAKmuu0sw\n' +
  'ruGgsbwpgOYJd+W+NKIByn/c4grmO7i77LpilfMFY0GCzQ87HUyVpNur+cmV6U/k\n' +
  'TecmmYHpvPm0KdIBembhLoz2IYrF+Hjhga6/05Cdqa3zr/04GpZnMBxRpVzscYqC\n' +
  'tGwPDBUf\n' +
  '-----END CERTIFICATE-----\n';

describe('applepass handlers', () => {
  const now = Date.now();
  const getServerCertsMock = jest.fn();
  const dateNowMock = jest.fn();

  let request: SuperTest<Test>;
  let credentials: PassCredentials;

  const randomImageURL = (): string => {
    const bytes = randomBytes(128).toString('base64');
    return `data:image/png;base64,${bytes}`;
  };

  const parseResponseBody = (response: Response, includeBinaryFiles = false) => {
    return new Promise((resolve, reject) => {
      const result = {};
      const pkpass = Buffer.from(response.body);

      yauzl.fromBuffer(pkpass, { autoClose: true }, (error, zipFile) => {
        if (error) return reject(error);
        if (zipFile === undefined) return reject(new Error('Unexpected error'));

        zipFile.on('end', () => resolve(result));
        zipFile.on('error', falure => reject(falure));
        zipFile.on('entry', entry => {
          const isDirectory = /\/$/.test(entry.fileName);
          if (isDirectory) return; // skip

          zipFile.openReadStream(entry, (err, readStream) => {
            if (err) throw err;
            const chunks: Uint8Array[] = [];
            readStream?.on('data', chunk => chunks.push(chunk));
            readStream?.on('end', () => {
              const buffer = Buffer.concat(chunks);
              const filePath = entry.fileName.split('/');

              if (entry.fileName.endsWith('.json')) {
                setPath(result, filePath, JSON.parse(buffer.toString('utf8')));
              }
              if (entry.fileName.endsWith('.strings')) {
                setPath(result, filePath, buffer.toString('utf8'));
              }
              // NOTE: This could results in a lots of noises in the assertion error
              if (includeBinaryFiles) {
                setPath(result, filePath, buffer);
              }
            });
          });
        });
      });
    });
  };

  beforeAll(async () => {
    const logger = Logger.instance.child({
      level: LoggerLevel.ERROR,
    });

    const handlers = buildApplePassHandlers({
      config: {
        getServerCerts: getServerCertsMock,
        applePassTemplatesPath: '/tmp/notexists',
      },
      storage: buildInMemoryStorage(),
      decoders: buildDecoders(logger),
    });

    const router = makeRouter();
    router.use(setRequestContext({ logger }));
    router.use('/', makeRouter(handlers).routes());

    const routes = middlewares.toCallback(router.routes());
    request = supertest(routes);

    const passphrase = 'top secret';
    const secrets = await generateRsaKeyPair();
    const certificates = await toX509Cert(secrets, passphrase);

    credentials = {
      teamIdentifier: 'testTeamIdentifier',
      passTypeIdentifier: 'testPassTypeIdentifier',
      certificates: {
        wwdr: APPLE_PASS_WWDR,
        signerCert: certificates.publicKey,
        signerKey: certificates.privateKey,
        signerKeyPassphrase: passphrase,
      },
    };
  });

  beforeEach(async () => {
    jest.resetAllMocks();
    global.Date.now = dateNowMock.mockReturnValue(now);
  });

  it('should return the generated pkpass file', async () => {
    const payload = {
      credentials,
      template: {
        id: 'TEST',
        model: {
          formatVersion: 1,
          organizationName: 'Paw Planet',
          description: 'Paw Planet Coupon',
          barcode: {
            format: 'PKBarcodeFormatQR',
            messageEncoding: 'iso-8859-1',
          },
          coupon: {
            primaryFields: [
              {
                key: 'offer',
                label: 'Any premium dog food',
                value: '120% off',
              },
            ],
          },
        },
        images: {
          icon: { url: randomImageURL() },
          logo: { url: randomImageURL() },
        },
      },
      barcode: 'ABCD1234',
    };
    await request
      .post('/')
      .send(payload)
      .expect(HttpStatus.OK)
      .expect('Content-Type', 'application/vnd.apple.pkpass')
      .expect('Content-Disposition', `attachment; filename=viper-${now}.pkpass`)
      .responseType('blob');
  });

  it('should populate template with dynamic data', async () => {
    const payload = {
      credentials,
      template: {
        id: 'TEST',
        model: {
          formatVersion: 1,
          organizationName: 'Paw Planet',
          description: 'Paw Planet Coupon',
          barcode: {
            format: 'PKBarcodeFormatQR',
            messageEncoding: 'iso-8859-1',
          },
          coupon: {
            primaryFields: [
              {
                key: 'offer',
                label: 'Any premium dog food',
                value: '{{ discount }} off',
              },
            ],
            auxiliaryFields: [
              {
                key: 'expires',
                label: 'EXPIRES',
                value: `{{ date expires "yyyy-MM-dd'T'HH:mmXXX" "Pacific/Auckland" }}`,
                isRelative: true,
                dateStyle: 'PKDateStyleShort',
              },
            ],
          },
        },
        images: {
          icon: { url: randomImageURL() },
          logo: { url: randomImageURL() },
        },
      },
      dynamicData: {
        discount: '120%',
        expires: 1366815600000, // Thu Apr 25 2013 03:00:00 GMT+1200
      },
      barcode: 'ABCD1234',
    };
    const response = await request
      .post('/')
      .send(payload)
      .expect(HttpStatus.OK)
      .responseType('blob')
      .then(parseResponseBody);

    expect(response).toMatchObject({
      'pass.json': {
        formatVersion: 1,
        organizationName: 'Paw Planet',
        description: 'Paw Planet Coupon',
        barcodes: [
          {
            format: 'PKBarcodeFormatQR',
            messageEncoding: 'iso-8859-1',
            message: 'ABCD1234',
          },
        ],
        coupon: {
          primaryFields: [
            {
              key: 'offer',
              label: 'Any premium dog food',
              value: '120% off',
            },
          ],
          auxiliaryFields: [
            {
              key: 'expires',
              label: 'EXPIRES',
              value: '2013-04-25T03:00+12:00',
              isRelative: true,
              dateStyle: 'PKDateStyleShort',
            },
          ],
        },
      },
    });
  });

  it('should populate template with the decoded payload', async () => {
    const encoder = new TextEncoder();
    const token = await new SignJWT({ userinfo: { email: 'user@example.com' } })
      .setProtectedHeader({ alg: 'HS256' })
      .sign(encoder.encode('random symmetric secrets'));

    const payload = {
      credentials,
      template: {
        id: 'TEST',
        model: {
          formatVersion: 1,
          organizationName: 'Paw Planet',
          description: 'Paw Planet Coupon',
          barcode: {
            format: 'PKBarcodeFormatQR',
            messageEncoding: 'iso-8859-1',
          },
          coupon: {
            primaryFields: [{ key: 'email', label: 'EMAIL', value: '{{ data.userinfo.email }}' }],
          },
        },
        images: {
          icon: { url: randomImageURL() },
          logo: { url: randomImageURL() },
        },
      },
      barcode: token,
    };
    const response = await request
      .post('/')
      .send(payload)
      .expect(HttpStatus.OK)
      .responseType('blob')
      .then(parseResponseBody);

    expect(response).toMatchObject({
      'pass.json': {
        formatVersion: 1,
        organizationName: 'Paw Planet',
        description: 'Paw Planet Coupon',
        barcodes: [{ format: 'PKBarcodeFormatQR', messageEncoding: 'iso-8859-1', message: token }],
        coupon: {
          primaryFields: [{ key: 'email', label: 'EMAIL', value: 'user@example.com' }],
        },
      },
    });
  });

  it.each([
    ['the ISO 6801 format by default', , , , '2022-02-15T14:00:00.000Z'],
    ['a given date format', 'dd MMM yyyy', , , '15 Feb 2022'],
    ['a given time format', 'hh:mm a', , , '02:00 PM'],
    ['a zoned date time', , 'Pacific/Auckland', , '2022-02-16T03:00:00.000+13:00'],
    ['a localized date format', "yyyy'年'MMMdo", , 'zh-CN', '2022年2月15日'],
  ])('should support format date value to %s', async (_desc, dateFormat, timeZone, locale, expected) => {
    const quote = (str?: string) => str && `"${str}"`;
    const expr = `{{ date expires ${quote(dateFormat)} ${quote(timeZone)} ${quote(locale)} }}`;

    const payload = {
      credentials,
      template: {
        id: 'TEST',
        model: {
          formatVersion: 1,
          organizationName: 'Paw Planet',
          description: 'Paw Planet Coupon',
          barcode: { format: 'PKBarcodeFormatQR', messageEncoding: 'iso-8859-1' },
          coupon: {
            auxiliaryFields: [{ key: 'expires', label: 'EXPIRES', value: expr }],
          },
        },
        images: {
          icon: { url: randomImageURL() },
          logo: { url: randomImageURL() },
        },
      },
      dynamicData: {
        expires: 1644933600000, // Feb 16 2022 03:00:00 GMT+1300
      },
      barcode: 'ABCD1234',
    };
    const response = await request
      .post('/')
      .send(payload)
      .expect(HttpStatus.OK)
      .responseType('blob')
      .then(parseResponseBody);

    expect(response).toMatchObject({
      'pass.json': {
        coupon: { auxiliaryFields: [{ key: 'expires', label: 'EXPIRES', value: expected }] },
      },
    });
  });

  it.each([
    ['upper-case', '{{ upper value }}', 'SAMPLE TEXT'],
    ['lower-case', '{{ lower value }}', 'sample text'],
    ['upper-case handles undefined', '{{ upper notExists }}', ''],
    ['lower-case handles undefined', '{{ lower notExists }}', ''],
  ])('should support format string value to %s', async (_desc, expr, expected) => {
    const payload = {
      credentials,
      template: {
        id: 'TEST',
        model: {
          formatVersion: 1,
          organizationName: 'Paw Planet',
          description: 'Paw Planet Coupon',
          barcode: { format: 'PKBarcodeFormatQR', messageEncoding: 'iso-8859-1' },
          coupon: {
            primaryFields: [{ key: 'key', label: 'LABEL', value: expr }],
          },
        },
        images: {
          icon: { url: randomImageURL() },
          logo: { url: randomImageURL() },
        },
      },
      dynamicData: {
        value: 'Sample Text',
      },
      barcode: 'ABCD1234',
    };
    const response = await request
      .post('/')
      .send(payload)
      .expect(HttpStatus.OK)
      .responseType('blob')
      .then(parseResponseBody);

    expect(response).toMatchObject({
      'pass.json': {
        coupon: { primaryFields: [{ key: 'key', label: 'LABEL', value: expected }] },
      },
    });
  });

  it.each([
    ['success case', '{{ required value }}', 'Sample Text'],
    ['failure case', '{{ required notExist }}', new Error('missing required value')],
  ])('should support enforce required value for %s', async (_desc, expr, expected) => {
    const payload = {
      credentials,
      template: {
        id: 'TEST',
        model: {
          formatVersion: 1,
          organizationName: 'Paw Planet',
          description: 'Paw Planet Coupon',
          barcode: { format: 'PKBarcodeFormatQR', messageEncoding: 'iso-8859-1' },
          coupon: {
            primaryFields: [{ key: 'key', label: 'LABEL', value: expr }],
          },
        },
        images: {
          icon: { url: randomImageURL() },
          logo: { url: randomImageURL() },
        },
      },
      dynamicData: {
        value: 'Sample Text',
      },
      barcode: 'ABCD1234',
    };

    if (expected instanceof Error) {
      await request
        .post('/')
        .send(payload)
        .expect(HttpStatus.BAD_REQUEST)
        .expect({ message: 'Invalid Argument Error' });
    } else {
      const response = await request
        .post('/')
        .send(payload)
        .expect(HttpStatus.OK)
        .responseType('blob')
        .then(parseResponseBody);
      expect(response).toMatchObject({
        'pass.json': {
          coupon: { primaryFields: [{ key: 'key', label: 'LABEL', value: expected }] },
        },
      });
    }
  });
});
