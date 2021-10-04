import Head from 'next/head';
import { useRouter } from 'next/router';
import { useState } from 'react';
import { useAsyncFn, useMount } from 'react-use';
import { stripIndent as markdown } from 'common-tags';

import { makeStyles } from '@navch-ui/styles';
import { useLatestCallback, useEventCallback } from '@navch-ui/hooks';
import { Box, Button, Text, Input } from '@navch-ui/core';

import { TemplatePicker, TemplateInfo } from '@modules/pass/TemplatePicker';
import { BarcodeReader } from '@modules/pass/BarcodeReader';

export default function Index() {
  const router = useRouter();
  const { styles } = useStyles();
  const [barcode, setBarcode] = useState<string>();
  const [showBarcodeReader, setBarcodeReader] = useState(false);

  const handleSelectAppleTemplate = useLatestCallback((templateId: string) => {
    router.replace({ pathname: '/pass/ios', query: { templateId, barcode } });
  });

  const handleSelectGoogleTemplate = useLatestCallback(async () => {
    const resp = await fetch('/viper/pass/android');
    if (!resp.ok) {
      throw new Error('Failed to generate Google Pay Pass');
    }
    const { redirectTo } = (await resp.json()) as { redirectTo: string };
    window.location.href = redirectTo;
  });

  const handleBarcodeChange = useLatestCallback((input: string) => {
    setBarcode(input);
    setBarcodeReader(false);
  });

  const [templates, fetchTemplates] = useAsyncFn(async () => {
    const resp = await fetch('/viper/pass/ios/templates');
    if (!resp.ok) {
      throw new Error('Failed to fetch Apple Pass templates');
    }
    return (await resp.json()) as TemplateInfo[];
  });
  useMount(fetchTemplates); // Fetch on client-side only

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
          <TemplatePicker templates={templates.value || []} onSelect={handleSelectAppleTemplate} />
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
          <Button onClick={handleSelectGoogleTemplate}>{'Save to Google Pay'}</Button>
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
