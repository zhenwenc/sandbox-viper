import Head from 'next/head';
import { useRouter } from 'next/router';
import { useState } from 'react';
import { useAsyncFn, useMount } from 'react-use';
import { stripIndent as markdown } from 'common-tags';

import { makeStyles } from '@navch-ui/styles';
import { useLatestCallback, useEventCallback } from '@navch-ui/hooks';
import { Box, Button, Text, Input } from '@navch-ui/core';

import { BarcodeReader } from '@components/BarcodeReader';
import { TemplatePicker, TemplateInfo } from '@components/TemplatePicker';

const SampleBarcodes = [
  {
    name: 'NZ COVID Pass (NZCP)',
    value:
      'NZCP:/1/2KCEVIQBEYCEK23FPEWTDICZAEGKKALLMRUWIOTXMVRDU6DYPACRUYLEUIMAIGTCKSQSQYTWMOSGQQDDN5XHIZLYOSBHQJTIOR2HA4Z2F4XXO53XFZ3TGLTPOJTS6MRQGE4C6Y3SMVSGK3TUNFQWY4ZPOYYXQJ3IOR2HA4Z2F4XWQZLBNR2GQLTHN53HILTOPIXWG4TFMRSW45DJMFWHGL3DOBXHUZ3WMVZHG2LPNZSTCLRQFYYGI5DZOBSYE5CWMVZGSZTJMFRGYZKDOJSWIZLOORUWC3DPKB2WE3DJMNBW65TJMRIGC43TOFRXEZLEMVXHI2LBNRJXKYTKMVRXJI3JM5UXMZLOJZQW2ZLGJBQXI5DJMVVGMYLNNFWHSTTBNVSWOR3JNRRGK4TUMNSG6YTKGE4TQOBNGAYS2MZRA7MEAUETDMAWCAZEJ4A2K6SOESOQW6VP3BAFQQFJWMPDRUDOUTHNM43JEKGTAKZX5XOCYOQFTEMEFD2LXSRG6XGAG2X2UO6KNK5JKPCSCIPWUJXIQ6YAOHYU4L7XU6BCS4QOTWB3OUEFQ',
  },
  {
    name: 'EU Digital COVID Certificate (HCERT)',
    value:
      'HC1:6BFOXN%TSMAHN-HVVOJ5W5.6TXB*8SAG4LR5OGIJ5S91J:X90B6 G8KQCX3CCV4*XUA2PWKP/HLIJLKNF8JF7LPMIH-O92UQHJAZ$U5XPXZQ H98PG..V.UITZUQ0OTZUYZQAJ9 0OO2WPRAAUICO1CV59UEEIGN770 LHZA0D9E2LBHHGKLO-K%FGLIA5D8MJKQJK JMDJL9GG.IA.C8KRDL4O54O4IGUJKJGI.IAHLCV5GJM7J8M HG4HGBIK6IA*$30JAXD16IASD9M82*88*DOXCRFE4/972JTN$K1RS$15SBCL20*W0VTQ8OI+*P2%KYZP-TG.MKLWLVRMES9PI02O5:12AL8TH1LOEDK2P:6UJ2*1B0J0Z1BXI0JOC7:4/K4/I24-29Q8Z8G1Z12$1XO9-*AC9R-38GNSM-Q:ASZ5RT7G/PN7ZIGVA0JNO$RZPNSVNUOSUQDMEU4.B50MV:5Z650QRP3U*.CYSRU:NUM6+KB6GT/JRF5I7A0Z.N60',
  },
];

export default function PassView() {
  const router = useRouter();
  const { styles } = useStyles();
  const [barcode, setBarcode] = useState<string>(SampleBarcodes[0].value);
  const [showBarcodeReader, setBarcodeReader] = useState(false);

  const handleSelectAppleTemplate = useLatestCallback((templateId: string) => {
    router.replace({ pathname: '/api/pass/ios', query: { templateId, barcode, forceReload: true } });
  });

  const handleSelectGoogleTemplate = useLatestCallback(async (templateId: string) => {
    router.replace({ pathname: '/api/pass/android', query: { templateId, barcode, forceReload: true } });
  });

  const handleBarcodeChange = useLatestCallback((input: string) => {
    setBarcode(input);
    setBarcodeReader(false);
  });

  const handleSampleBarcodeClick = useLatestCallback(() => {
    const index = SampleBarcodes.findIndex(x => x.value === barcode);
    handleBarcodeChange(SampleBarcodes[(index + 1) % SampleBarcodes.length].value);
  });

  const [applePassTemplates, fetchApplePassTemplates] = useAsyncFn(async () => {
    const resp = await fetch('/viper/api/pass/ios/templates');
    if (!resp.ok) {
      throw new Error('Failed to fetch Apple Pass templates');
    }
    return (await resp.json()) as TemplateInfo[];
  });
  useMount(fetchApplePassTemplates); // Fetch on client-side only

  const [androidPassTemplates, fetchAndroidPassTemplates] = useAsyncFn(async () => {
    const resp = await fetch('/viper/api/pass/android/templates');
    if (!resp.ok) {
      throw new Error('Failed to fetch Android Pass templates');
    }
    return (await resp.json()) as TemplateInfo[];
  });
  useMount(fetchAndroidPassTemplates); // Fetch on client-side only

  return (
    <Box id="pass-generator" classes={styles.container}>
      <Head>
        <title>{'Viper • Sandbox'}</title>
      </Head>

      <Box flex column pv={9} ph={5} classes={styles.content}>
        <Box classes={styles.card}>
          <Text variant="h5" textAlign="center">
            {'Pass Generator'}
          </Text>
          <Text variant="subtitle1" textAlign="center">
            {'Add a pass to your native wallet app.'}
          </Text>
        </Box>

        <Box classes={styles.card}>
          <Text variant="h6">{'Enter Barcode Content'}</Text>
          <Text variant="subtitle1" pv={4}>
            {markdown`
              Please enter the message to be encoded in the barcode area, or Scan
              a QR code from camera. The message will be represented based on the
              defined message type in the template.
            `}
          </Text>
          <Input
            id="qrcode-text-input"
            rows={5}
            multiline
            hideBaseline
            spellCheck={false}
            value={barcode || ''}
            placeholder="HC1:..."
            onChange={useEventCallback((e: React.ChangeEvent<HTMLInputElement>) => {
              handleBarcodeChange(e.target.value);
            })}
          />
          <Box grid mt={3} justify="end" classes={styles.cardActions}>
            <Button onClick={handleSampleBarcodeClick}>{'Next'}</Button>
            <Button onClick={() => setBarcodeReader(true)}>{'Scan'}</Button>
            <Button onClick={() => setBarcode('')}>{'Clear'}</Button>
          </Box>
        </Box>

        <Box classes={styles.card}>
          <Text variant="h6">{'Pick an Apple Pass Template'}</Text>
          <Text variant="subtitle1" pv={4}>
            {markdown`
              Generate an Apple pass with a predefined template, or upload your template.
              You can preview the downloaded .pkpass bundle with the Pass Viewer app on macOS.
              If you're in an iOS device, you will be prompted to add the generated pass into
              the pass library directly.
            `}
          </Text>
          <TemplatePicker templates={applePassTemplates.value || []} onSelect={handleSelectAppleTemplate} />
        </Box>

        <Box classes={styles.card}>
          <Text variant="h6">{'Pick a Google Pass Template'}</Text>
          <Text variant="subtitle1" pv={4}>
            {markdown`
              Generate a Google Pay pass with a predefined template, or upload your template.
              The pass will be saved into your Google Pay account once succeed. You must visit
              the site in an Android device or an emulator.
            `}
          </Text>
          <TemplatePicker
            templates={androidPassTemplates.value || []}
            onSelect={handleSelectGoogleTemplate}
          />
        </Box>
      </Box>

      <BarcodeReader
        isOpen={showBarcodeReader}
        onScan={handleBarcodeChange}
        onClose={() => setBarcodeReader(false)}
      />
    </Box>
  );
}

const useStyles = makeStyles(theme => ({
  container: {
    width: '100%',
    minHeight: '100vh',
    backgroundColor: theme.color.ui.tint3,
  },
  content: {
    minWidth: 300,
    maxWidth: 680,
    marginLeft: 'auto',
    marginRight: 'auto',
    backgroundColor: theme.color.ui.tint3,
  },
  card: {
    width: '100%',
    padding: theme.spacing(6),
    marginBottom: theme.spacing(4),
    borderRadius: theme.shape.borderRadius,
    backgroundColor: theme.color.ui.tint2,
  },
  cardActions: {
    gridAutoFlow: 'column',
    columnGap: theme.spacing(2),
    paddingTop: theme.spacing(3),
    borderTop: `1px solid ${theme.color.border.base}`,
  },
}));
