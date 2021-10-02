import type { AppProps } from 'next/app';

import { Theme, ThemeContext } from '@navch-ui/styles';
import { OverlayContainer } from '@navch-ui/core';

const baseTheme = new Theme();
export const theme = Theme.extend(baseTheme, {
  color: {
    ui: {
      tint1: '#3A4B53',
      tint2: '#263238',
      tint3: '#2E3C43',
      tint4: '#18222F',
      inverse: baseTheme.color.ui.tint2,
    },
    text: {
      base: '#CFD8DC',
      dark: baseTheme.color.scale.neutral.N5,
      muted: '#697A83',
      inverse: baseTheme.color.text.base,
    },
  },
  border: {
    color: {
      base: baseTheme.color.text.muted,
    },
    radius: baseTheme.spacing(2),
  },
});

export default function App(props: AppProps) {
  const { Component, pageProps } = props;

  return (
    <>
      <ThemeContext.Provider value={theme}>
        <Component {...pageProps} />
      </ThemeContext.Provider>

      <OverlayContainer />
    </>
  );
}
