import Link from 'next/link';

import { Box, Card, Text, Divider } from '@navch-ui/core';

export default function Index() {
  return (
    <Box fluid>
      <Link href="/pass">
        <Card raised interactive>
          <Box padded centered>
            <Text bold>{'Wallet Pass Generator'}</Text>
          </Box>
        </Card>
      </Link>

      <Divider fluid />

      <Link href="/tools/bluetooth">
        <Card raised interactive>
          <Box padded centered>
            <Text bold>{'Bluetooth Web API (BLE)'}</Text>
          </Box>
        </Card>
      </Link>
    </Box>
  );
}
