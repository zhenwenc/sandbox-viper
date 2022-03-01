import * as Locales from 'date-fns/locale';
import R from 'ramda';
import memoize from 'memoizee';
import Handlebars from 'handlebars';
import { formatInTimeZone } from 'date-fns-tz';
import { format, Locale } from 'date-fns';

import { isNotNullish, BadRequestError } from '@navch/common';

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

const parseTimeZoneSafe = (code: unknown): string | undefined => {
  if (typeof code !== 'string') return undefined;
  return code;
};

Handlebars.registerHelper('upper', str => (str ? R.toUpper(str) : ''));
Handlebars.registerHelper('lower', str => (str ? R.toLower(str) : ''));

Handlebars.registerHelper('required', value => {
  if (!isNotNullish(value)) {
    throw new BadRequestError('Error rendering expression, missing required value');
  }
  return value;
});

/**
 * Format the datetime/timestamp value with a given format, and optionally using
 * the specified timezone and locale.
 *
 * Only avaibale locales in `date-fns/locale` are supported.
 *
 * Apart from the format tokens supported by `date-fns/format`, you can format the
 * full timezone name with unicode tokens:
 *
 * - `z..zzz`: short specific non-location format, e.g. `EST`
 * - `zzzz`: long specific non-location format, e.g. `Eastern Standard Time`
 *
 * @param date valid JS date/time string or unix timestamp in milliseconds
 * @param dateFormat an optional string of RT35 date format tokens
 * @param timeZone an optional IANA time zone name or offset string
 * @param locale an optional BCP 47 language code that `date-fns/locale` supports
 *
 * @see {@link https://date-fns.org/v2.28.0/docs/format}
 */
Handlebars.registerHelper('date', (value, maybeFormat, maybeTimeZone, maybeLocale) => {
  if (value == null) return undefined;

  const date = new Date(value);
  const dateFormat = maybeFormat ?? "yyyy-MM-dd'T'HH:mm:ss.SSSXXX";
  const timeZone = parseTimeZoneSafe(maybeTimeZone) ?? 'GMT';
  const locale = parseLocaleSafe(maybeLocale);

  return timeZone
    ? formatInTimeZone(date, timeZone, dateFormat, { locale })
    : format(date, dateFormat, { locale });
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
