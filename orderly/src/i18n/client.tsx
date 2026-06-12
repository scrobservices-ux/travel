"use client";

import { createContext, useContext } from "react";
import { dictionaries, type Dictionary, type Locale } from "./dictionaries";

const LocaleContext = createContext<{ locale: Locale; dict: Dictionary }>({
  locale: "fr",
  dict: dictionaries.fr,
});

export function LocaleProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  return (
    <LocaleContext.Provider value={{ locale, dict: dictionaries[locale] ?? dictionaries.fr }}>
      {children}
    </LocaleContext.Provider>
  );
}

/** Client-side dictionary for the active locale. */
export function useDict() {
  return useContext(LocaleContext).dict;
}

export function useLocale() {
  return useContext(LocaleContext).locale;
}
