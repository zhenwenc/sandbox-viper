import React from 'react';
import Head from 'next/head';
import Link from 'next/link';

import { Box, BoxLikeProps, Button, Text } from '@navch-ui/core';

export type LayoutProps = BoxLikeProps & {
  readonly children: React.ReactNode;
};

export const Layout: React.FC<LayoutProps> = props => {
  const { children, ...boxProps } = props;

  return (
    <Box flex column background="tint3" style={{ minHeight: 'calc(100vh)' }}>
      <Head>
        <title>{'Viper • Sandbox'}</title>
      </Head>

      <Box flex fluid layer={1} pv={3} justify="center" background="tint2">
        <Box fluid align="center" container="md">
          <Link href="/">
            <Button variant="text">
              <Text variant="h6">{'Viper Sandbox'}</Text>
            </Button>
          </Link>
        </Box>
      </Box>

      <Box flex={1} pv={8} justify="center">
        <Box flex column container="md" {...boxProps}>
          {children}
        </Box>
      </Box>
    </Box>
  );
};
