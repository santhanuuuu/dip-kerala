import { useLanguage, type Lang } from './context';

/** A per-page translation dictionary: one object per language, each mapping a local key to
 * its translated string. Every page keeps its own dict file (i18n/dict/<page>.ts) rather than
 * one giant shared file -- keeps each page's translations next to the page, and keys only need
 * to be unique within a page, not across the whole app. */
export type Dict = Record<Lang, Record<string, string>>;

/** useT(dict) -> t(key). Falls back to the English string, then to the raw key, so a missing
 * translation degrades to readable English instead of a blank or "undefined". */
export function useT(dict: Dict) {
  const { lang } = useLanguage();
  return (key: string): string => dict[lang]?.[key] ?? dict.en[key] ?? key;
}

/** Type of the t() function returned by useT -- handy for passing a resolved t into a
 * standalone (non-component) helper function that can't call hooks itself. */
export type TFunc = (key: string) => string;
