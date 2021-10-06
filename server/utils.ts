import get from 'lodash/get';

export function resolveTemplateValue(data: Record<string, unknown>, expr: string) {
  if (typeof expr !== 'string') return undefined;
  const matches = expr.match(/^{{\s*([\w\d\.\[\]]+)\s*}}$/);
  return matches ? get(data, matches[1]) : undefined;
}
