import R from 'ramda';
import Handlebars from 'handlebars';
import { format } from 'date-fns-tz';

Handlebars.registerHelper('upper', str => R.toUpper(str));
Handlebars.registerHelper('lower', str => R.toLower(str));

Handlebars.registerHelper('date', (date, dateFormat, timeZone) => {
  if (date == null) return undefined;
  return format(new Date(date), dateFormat, { timeZone });
});

export function resolveTemplateValue(data: Record<string, unknown>, expr: string) {
  if (typeof expr !== 'string') return undefined;
  return Handlebars.compile(expr)(data);
}
