import dynamic from 'next/dynamic';

import { Modal } from '@navch-ui/core';
import { useLatestCallback } from '@navch-ui/hooks';

// The library requires `Blob` that doesn't work on SSR
const QrReader = dynamic(() => import('react-qr-reader'), { ssr: false });

export type ScannedState = { data?: string; error?: Error };

export interface Props {
  readonly isOpen: boolean;
  readonly onScan: (data: string) => void;
  readonly onClose: () => void;
}

export const BarcodeReader: React.FC<Props> = props => {
  const { isOpen, onScan, onClose } = props;

  const handleScan = useLatestCallback((input: string | null) => {
    if (!input) return;
    onScan(input);
  });

  const handleError = useLatestCallback((err: Error) => {
    console.error('[BarcodeReader] Error:', err);
  });

  return (
    <Modal title="Wallet Pass Barcode Reader" isOpen={isOpen} onClose={onClose}>
      {isOpen && <QrReader delay={500} onError={handleError} onScan={handleScan} resolution={1024} />}
    </Modal>
  );
};
