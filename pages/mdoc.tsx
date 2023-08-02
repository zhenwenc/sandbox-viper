import * as R from 'ramda';
import { source as markdown } from 'common-tags';

import {
  Box,
  Button,
  Card,
  Form,
  FormField,
  Text,
  Input,
  Message,
  Markdown,
  Switch,
  useForm,
} from '@navch-ui/core';
import { useAsync, useAsyncFn, useMountedState } from '@navch-ui/hooks';

type InputOptions = {
  readonly deviceEngagement: string;
};

export default function MDocView() {
  const isMounted = useMountedState();
  const isWebBluetoothApiEnabled = useAsync(async () => {
    return isMounted() && (await navigator.bluetooth.getAvailability());
  }, [isMounted()]);

  const [, scanNearbyDevices] = useAsyncFn(async (serviceUUID: string) => {
    try {
      console.info('Scan bluetooth device', { serviceUUID });
      return await navigator.bluetooth.requestDevice({
        filters: [{ services: [serviceUUID] }],
      });
    } catch (err) {
      console.error('Failed to scan nearby devices:', err);
      throw err;
    }
  });

  const form = useForm<InputOptions>({
    onSubmit: async ({ values }) => {
      const device = await scanNearbyDevices();
    },
  });

  return (
    <Box id="mdoc" fluid>
      <Card raised padded mb={3}>
        <Markdown>{markdown`
MDoc Credential Playground
        `}</Markdown>
      </Card>

      <Card raised hidden={!isMounted() || !!isWebBluetoothApiEnabled.value}>
        <Message flex variant="error" align="center">
          <Markdown>{markdown`
Bluetooth is not supported on your browser!
          `}</Markdown>
        </Message>
      </Card>

      <Card raised hidden={!isMounted() || !isWebBluetoothApiEnabled.value} mb={3}>
        <Form form={form} padded>
          <FormField span={6} field="deviceEngagement" label="Device Engagement" required>
            <Input placeholder="mdoc:..." />
          </FormField>
        </Form>

        <Box flex fluid justify="end" padded topline>
          <Button onClick={() => form.submit()}>{'Pair'}</Button>
        </Box>
      </Card>

      <Card raised hidden={!isMounted() || !isWebBluetoothApiEnabled.value}>
        {device.error ? (
          <Message variant="error" align="center">
            <Text variant="subtitle1" scrollable>
              {device.error.message}
            </Text>
          </Message>
        ) : device.loading ? (
          <Message variant="loading" />
        ) : device.value ? (
          <Message variant="success">
            <Text>ID: {device.value.id}</Text>
            <Text>Name: {device.value.name ?? 'Unknown'}</Text>
          </Message>
        ) : (
          <Message variant="info" align="center">
            <Text component="pre" variant="subtitle1" scrollable>
              {`Click "Scan" to pair devices`}
            </Text>
          </Message>
        )}
      </Card>
    </Box>
  );
}
