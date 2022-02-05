export type Decoder = {
  isMatch(input: string): boolean;
  decode(input: string): Promise<DecodeResult>;
};

export type DecodeResult = {
  raw: Record<string, unknown>;
  data: Record<string, unknown>; // decoded payload
  meta: Record<string, unknown>;
};

export type PayloadRecord = Record<string, unknown>;
