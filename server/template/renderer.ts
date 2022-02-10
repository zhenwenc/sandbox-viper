import * as Locales from 'date-fns/locale';
import R from 'ramda';
import Handlebars from 'handlebars';
import { format } from 'date-fns-tz';

const parseLocaleSafe = (code: unknown): Locale | undefined => {
  if (typeof code !== 'string') return undefined;
  return Locales[code] as Locale;
};

Handlebars.registerHelper('upper', str => R.toUpper(str));
Handlebars.registerHelper('lower', str => R.toLower(str));

Handlebars.registerHelper('date', (date, dateFormat, timeZone, locale) => {
  if (date == null) return undefined;
  return format(new Date(date), dateFormat, {
    timeZone,
    locale: parseLocaleSafe(locale),
  });
});

export function resolveTemplateValue(data: Record<string, unknown>, expr: string) {
  if (typeof expr !== 'string') return undefined;
  return Handlebars.compile(expr)(data);
}
