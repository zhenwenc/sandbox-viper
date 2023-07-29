import Link from 'next/link';

import { Box, Card, Text } from '@navch-ui/core';

export default function Index() {
  return (
    <Box>
      <Link href="/pass">
        <Card fluid raised interactive>
          <Box padded textAlign="center">
            <Text bold>{'Wallet Pass Generator'}</Text>
          </Box>
        </Card>
      </Link>
    </Box>
  );
}
