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

export default function Index() {
  const router = useRouter();
  const { styles } = useStyles();
  const [barcode, setBarcode] = useState<string>(
    'NZCP:/1/2KCEVIQBEYCEK23FPEWTDICZAEGKKALLMRUWIOTXMVRDU6DYPACRUYLDTBOQIGTCKOLW2YTWMOSGQQDDN5XHIZLYOSBHQJTIOR2HA4Z2F4XXO53XFZ3TGLTPOJTS6MRQGE4C6Y3SMVSGK3TUNFQWY4ZPOYYXQJ3IOR2HA4Z2F4XWQZLBNR2GQLTHN53HILTOPIXWG4TFMRSW45DJMFWHGL3DOBXHUZ3WMVZHG2LPNZSTCLRQFYYGI5DZOBSYE5CWMVZGSZTJMFRGYZKDOJSWIZLOORUWC3DPKB2WE3DJMNBW65TJMRIGC43TOFRXEZLEMVXHI2LBNRJXKYTKMVRXJI3JM5UXMZLOJZQW2ZLGJBQXI5DJMVVGMYLNNFWHSTTBNVSWOR3JNRRGK4TUMNSG6YTKGE4TQOBNGAYS2MZRA7MEAUCWJFQ542IYJCNYAHHKJ2PSSBAK3BAFQQHEAD5JWPRPJICOESHPHYDTQCFYVSNTGVSKCKVHWDORQXUTBORYAC5X4ZYLIACNFG4AF7DZLFBVZELFYG3SVOLQFWTVD3KDOQBMA4SCG'
  );
  const [showBarcodeReader, setBarcodeReader] = useState(false);

  const handleSelectAppleTemplate = useLatestCallback((templateId: string) => {
    router.replace({ pathname: '/pass/ios', query: { templateId, barcode } });
  });

  const handleSelectGoogleTemplate = useLatestCallback(async (templateId: string) => {
    router.replace({ pathname: '/pass/android', query: { templateId, barcode } });
  });

  const handleBarcodeChange = useLatestCallback((input: string) => {
    setBarcode(input);
    setBarcodeReader(false);
  });

  const [applePassTemplates, fetchApplePassTemplates] = useAsyncFn(async () => {
    const resp = await fetch('/viper/pass/ios/templates');
    if (!resp.ok) {
      throw new Error('Failed to fetch Apple Pass templates');
    }
    return (await resp.json()) as TemplateInfo[];
  });
  useMount(fetchApplePassTemplates); // Fetch on client-side only

  const [androidPassTemplates, fetchAndroidPassTemplates] = useAsyncFn(async () => {
    const resp = await fetch('/viper/pass/android/templates');
    if (!resp.ok) {
      throw new Error('Failed to fetch Android Pass templates');
    }
    return (await resp.json()) as TemplateInfo[];
  });
  useMount(fetchAndroidPassTemplates); // Fetch on client-side only

  return (
    <Box id="apple-pass-generator" classes={styles.container}>
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
    borderRadius: theme.border.radius,
    backgroundColor: theme.color.ui.tint2,
  },
  cardActions: {
    gridAutoFlow: 'column',
    columnGap: theme.spacing(2),
    paddingTop: theme.spacing(3),
    borderTop: `1px solid ${theme.border.color.base}`,
  },
}));
