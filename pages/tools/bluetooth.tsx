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

const removeNilProps = R.reject(R.isNil);

type InputOptions = {
  readonly serviceFilter?: string;
  readonly nameFilter?: string;
  readonly serviceFilterOptional?: string;
  readonly noFilter?: boolean;
};

export default function BluetoothView() {
  const isMounted = useMountedState();
  const isWebBluetoothApiEnabled = useAsync(async () => {
    return isMounted() && (await navigator.bluetooth.getAvailability());
  }, [isMounted()]);

  const [device, scanNearbyDevices] = useAsyncFn(async (options: RequestDeviceOptions) => {
    try {
      console.info('Scanning nearby bluetooth devices', options);
      const result = await navigator.bluetooth.requestDevice(options);
      console.info('Detected nearby bluetooth devices', result);
      return result;
    } catch (err) {
      console.error('Failed to scan nearby devices:', err);
      throw err;
    }
  });

  const form = useForm<InputOptions>({
    onSubmit: async ({ values }) => {
      if (values.noFilter) {
        await scanNearbyDevices({
          acceptAllDevices: true,
          optionalServices: values.serviceFilterOptional?.split(','),
        });
      } else {
        await scanNearbyDevices({
          filters: [
            removeNilProps({
              services: values.serviceFilter?.split(','),
              name: values.nameFilter,
            }),
          ],
        });
      }
    },
  });

  return (
    <Box id="tools-bluetooth" fluid>
      <Card raised padded mb={3}>
        <Markdown>
          {markdown`
            The [Web Bluetooth API](https://developer.chrome.com/articles/bluetooth/)
            lets websites discover and communicate with nearby devices over the
            Bluetooth 4 wireless standard using the Generic Attribute Profile (GATT).

            <small>
            A subset of the Web Bluetooth API is available **only** in ChromeOS, Chrome
            for Android 6.0, Mac (Chrome 56) and Windows 10 (Chrome 70).
            </small>
          `}
        </Markdown>
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
          <FormField span={6} field="serviceFilter" label="Service Filter">
            <Input placeholder="battery_service,..." />
          </FormField>
          <FormField span={6} field="nameFilter" label="Name Filter">
            <Input placeholder="Francois robot" />
          </FormField>
          <FormField span={6} field="serviceFilterOptional" label="Optional Service Filter">
            <Input placeholder="battery_service,..." />
          </FormField>
          <FormField span={6} field="no_filter" label="No Filter">
            <Switch />
          </FormField>
        </Form>

        <Box flex fluid justify="end" padded topline>
          <Button onClick={() => form.submit()}>{'Scan'}</Button>
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
