import * as Locales from 'date-fns/locale';
import R from 'ramda';
import memoize from 'memoizee';
import Handlebars from 'handlebars';
import { format } from 'date-fns-tz';
import { Locale } from 'date-fns';

import { isNotNullish } from '@navch/common';

const getAllLocales = memoize((): Map<string, Locale> => {
  const pairs = Object.values(Locales).map((item: Locale) => {
    if (!item.code) return undefined;
    return [item.code, item] as const;
  });
  return new Map(pairs.filter(isNotNullish));
});

const parseLocaleSafe = (code: unknown): Locale | undefined => {
  if (typeof code !== 'string') return undefined;
  return getAllLocales().get(code);
};

Handlebars.registerHelper('upper', str => R.toUpper(str));
Handlebars.registerHelper('lower', str => R.toLower(str));

/**
 * Format the datetime/timestamp value with a given format, and optionally using
 * the specified timezone and locale.
 *
 * Only avaibale locales in `date-fns/locale` are supported.
 */
Handlebars.registerHelper('date', (date, dateFormat, timeZone, locale) => {
  if (date == null) return undefined;
  return format(new Date(date), dateFormat, {
    timeZone,
    locale: parseLocaleSafe(locale),
  });
});

/**
 * URL-encode the text provided.
 */
Handlebars.registerHelper('url', str => {
  if (typeof str !== 'string') return undefined;
  return encodeURIComponent(str);
});

export function resolveTemplateValue(data: Record<string, unknown>, expr: string) {
  if (typeof expr !== 'string') return undefined;
  return Handlebars.compile(expr)(data);
}
