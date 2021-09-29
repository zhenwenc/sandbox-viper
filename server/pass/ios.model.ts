import * as t from 'io-ts';
import fs from 'fs-extra';
import path from 'path';
import yauzl from 'yauzl';
import { Logger, isNotNullish } from '@navch/common';

export const PassModelBarcode = t.type({
  message: t.string,
  format: t.union([
    t.literal('PKBarcodeFormatQR'),
    t.literal('PKBarcodeFormatPDF417'),
    t.literal('PKBarcodeFormatAztec'),
    t.literal('PKBarcodeFormatCode128'),
  ]),
  messageEncoding: t.literal('iso-8859-1'),
});

export const PassModelLocation = t.type({
  longitude: t.number,
  latitude: t.number,
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

export const PassModelIdentifiers = t.type({
  teamIdentifier: t.string,
  passTypeIdentifier: t.string,
});

export const PassModelCertificates = t.type({
  wwdr: t.string,
  signerCert: t.string,
  signerKey: t.type({
    keyFile: t.string,
    passphrase: t.string,
  }),
});

export type PassModelBundle = {
  'logo.png'?: Buffer;
  'logo@2x.png'?: Buffer;
  'icon.png'?: Buffer;
  'icon@2x.png'?: Buffer;
  'thumbnail.png'?: Buffer;
  'thumbnail@2x.png'?: Buffer;
  'pass.json'?: Buffer;
  'it.lproj/pass.strings'?: Buffer;
};

/**
 * Function that reads the Apple Wallet Pass template model from a folder.
 * This is the preferred approach when the application has filesystem access.
 */
export async function parseModelDir(modelDir: string): Promise<PassModelBundle> {
  try {
    const readFile = (filePath: string) => {
      if (fs.existsSync(filePath)) {
        return fs.readFileSync(filePath);
      }
      return undefined;
    };
    return {
      'logo.png': readFile(path.join(modelDir, 'logo.png')),
      'logo@2x.png': readFile(path.join(modelDir, 'logo@2x.png')),
      'icon.png': readFile(path.join(modelDir, 'icon.png')),
      'icon@2x.png': readFile(path.join(modelDir, 'icon@2x.png')),
      'thumbnail.png': readFile(path.join(modelDir, 'thumbnail.png')),
      'thumbnail@2x.png': readFile(path.join(modelDir, 'thumbnail@2x.png')),
      'pass.json': readFile(path.join(modelDir, 'pass.json')),
      'it.lproj/pass.strings': readFile(path.join(modelDir, 'it.lproj/pass.strings')),
    };
  } catch (err) {
    err.message = `Failed to parse model folder at ${modelDir}: ${err.message}`;
    throw err;
  }
}

/**
 * Function that extracts the Apple Wallet Pass template model from a ZIP buffer.
 * This is useful when the template is stored in the database or fetched from remote
 * server that doesn't work well with multiple files.
 *
 * FIXME: The callback hell style is really ugly, is there any better way?
 */
export async function parseModelZip(modelZip: Buffer): Promise<PassModelBundle> {
  const validFileNames = [
    'logo.png',
    'logo@2x.png',
    'icon.png',
    'icon@2x.png',
    'thumbnail.png',
    'thumbnail@2x.png',
    'pass.json',
    'it.lproj/pass.strings',
  ];

  // Extract the given entry's content into a Buffer
  const readEntry = (bundle: yauzl.ZipFile, entry: yauzl.Entry, cb: (buf: Buffer) => void) => {
    bundle.openReadStream(entry, (err, readStream) => {
      // if the stream is already closed, or the compressed data is invalid, it will emit an error
      if (err) {
        err.message = `Failed to read entry contnet for ${entry.fileName}: ${err.message}`;
        throw err;
      }
      // this case doesn't seem to be possible
      if (!readStream) {
        throw new Error(`Expected read stream for entry: ${entry.fileName}`);
      }
      const chunks: Uint8Array[] = [];
      readStream.on('data', chunk => chunks.push(chunk));
      readStream.on('end', () => cb(Buffer.concat(chunks)));
    });
  };

  const program = new Promise<PassModelBundle>((resolve, reject) => {
    const result = {} as PassModelBundle;

    yauzl.fromBuffer(modelZip, { autoClose: true, lazyEntries: true }, (err, bundle) => {
      if (err) return reject(err);
      if (bundle === undefined) {
        throw new Error('No content found from pass model bundle');
      }

      bundle.readEntry();
      bundle.on('end', () => resolve(result));
      bundle.on('entry', (entry: yauzl.Entry) => {
        if (/\/$/.test(entry.fileName)) {
          // for directories, if the entry's file names end with '/'
          bundle.readEntry();
        } else {
          // the tarball may contains OS metadata which we don't care about.
          //
          // XXX: We may apply post filter the results with exact record type
          const fileName = validFileNames.find(str => {
            return entry.fileName.endsWith(`/${str}`);
          });
          if (fileName !== undefined) {
            readEntry(bundle, entry, buffer => {
              result[fileName] = buffer;
              bundle.readEntry();
            });
          } else {
            bundle.readEntry();
          }
        }
      });
    });
  });

  return await program.catch(err => {
    err.message = `Failed to parse model bundle zip: ${err.message}`;
    throw err;
  });
}

export async function getLocalModels(rootDir: string, logger: Logger) {
  const promises = fs.readdirSync(rootDir, { withFileTypes: true }).map(dirent => {
    if (dirent.name.endsWith('.pass') && dirent.isDirectory()) {
      logger.info(`Loading Apple Pass template: ${dirent.name}`);
      return parseModelDir(path.join(rootDir, dirent.name));
    }
    if (dirent.name.endsWith('.pass.zip') && dirent.isFile()) {
      logger.info(`Loading Apple Pass template bundle: ${dirent.name}`);
      return parseModelZip(fs.readFileSync(path.join(rootDir, dirent.name)));
    }
    logger.debug(`Skipped loading unknown file: ${dirent.name}`);
    return Promise.resolve(undefined);
  });

  return (await Promise.all(promises)).filter(isNotNullish);
}
