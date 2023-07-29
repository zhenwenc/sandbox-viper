import Document, { Html, Head, Main, NextScript, DocumentContext } from 'next/document';

import { renderStatic } from '@navch-ui/styles';

export interface DocumentProps {
  styleHTML: string;
  scriptHTML: string;
}

export default class RootDocument extends Document<DocumentProps> {
  static async getInitialProps(ctx: DocumentContext) {
    const { rendered, ...styleProps } = renderStatic(() => Document.getInitialProps(ctx));
    const initialProps = await rendered;
    return { ...initialProps, ...styleProps };
  }

  render() {
    const { scriptHTML, styleHTML } = this.props;

    return (
      <Html>
        <Head>
          <link
            rel="stylesheet"
            href="https://cdnjs.cloudflare.com/ajax/libs/normalize/8.0.1/normalize.min.css"
          />
          <link
            rel="stylesheet"
            href="https://fonts.googleapis.com/css?family=Rubik:300,400,500,700&display=swap"
          />
          <style data-aphrodite dangerouslySetInnerHTML={{ __html: styleHTML }} />
        </Head>
        <body>
          <Main />
          <NextScript />
          <script dangerouslySetInnerHTML={{ __html: scriptHTML }} />
        </body>
      </Html>
    );
  }
}
