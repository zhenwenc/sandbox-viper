import Head from 'next/head';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useAsyncFn, useMount } from 'react-use';
import { stringifyUrl } from 'query-string';

import { makeStyles } from '@navch-ui/styles';
import { useSelection, useEventCallback } from '@navch-ui/hooks';
import { Box, Button, Text, Input } from '@navch-ui/core';

import { TemplatePicker, TemplateInfo } from '@modules/pass/TemplatePicker';

export default function Index() {
  const { styles } = useStyles();
  const [barcode, setBarcode] = useState<string>();
  const [templateId, templatePicker] = useSelection<string>();

  const downloadUrl = useMemo(() => {
    if (!barcode || !templateId) return;
    return stringifyUrl({ url: '/pass/ios', query: { templateId, barcode } });
  }, [templateId, barcode]);

  const [templates, fetchTemplates] = useAsyncFn(async () => {
    const resp = await fetch('/viper/pass/templates/ios');
    if (!resp.ok) {
      throw new Error('Failed to fetch Apple Pass templates');
    }
    return (await resp.json()) as TemplateInfo[];
  });
  useMount(fetchTemplates); // Fetch on client-side only

  return (
    <Box classes={styles.container}>
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
          <Text variant="h6">{'Pick a Pass Template'}</Text>
          <Box mt={4}>
            <TemplatePicker
              templates={templates.value || []}
              onSelect={templatePicker.select}
              isSelected={templatePicker.isSelected}
            />
          </Box>
        </Box>

        <Box classes={styles.card}>
          <Text variant="h6">{'Input the Barcode'}</Text>
          <Box mt={4}>
            <Input
              id="qrcode-text-input"
              rows={5}
              multiline
              hideBaseline
              spellCheck={false}
              value={barcode || ''}
              style={{ height: '100%', color: 'red' }}
              placeholder="HC1:..."
              onChange={useEventCallback((e: React.ChangeEvent<HTMLInputElement>) => {
                setBarcode(e.target.value);
              })}
            />
          </Box>
        </Box>

        <Box classes={styles.card}>
          <Text variant="h6">{'Add to Wallet'}</Text>
          <Box mt={4}>
            <Link href={downloadUrl || '#'}>
              <Button disabled={!downloadUrl}>{'Generate'}</Button>
            </Link>
          </Box>
        </Box>
      </Box>
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
}));
