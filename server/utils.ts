import mustache from 'mustache';

export function resolveTemplateValue(data: Record<string, unknown>, expr: string) {
  if (typeof expr !== 'string') return undefined;
  return mustache.render(expr, data);
}
