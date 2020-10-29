// To use, remove lang attribute from index.html, import translate function, and call with translation key:
// translate("~INTRO.HELLO")

import enUS from "./lang/en-us.json";
import es from "./lang/es.json";

const languageFiles = [
  {key: "en-US", contents: enUS},   // US English
  {key: "es",    contents: es},     // Spanish
];

// returns baseLANG from baseLANG-REGION if REGION exists
// this will, for example, convert en-US to en
const getBaseLanguage = (langKey: any) => {
  return langKey.split("-")[0];
};

// Get the HTML DOM lang property of the root element of the document
const getPageLanguage = () => {
  const pageLang = document.documentElement.lang;
  return pageLang && (pageLang !== "unknown") ? pageLang : undefined;
};

// Get the first valid language specified by the browser
const getFirstBrowserLanguage = () => {
  const nav: any = window.navigator;
  // userLanguage and browserLanguage are non standard but required for IE support
  const languages = [...nav.languages, nav.language, nav.userLanguage, nav.browserLanguage];
  return languages.find((browserLang) => browserLang);
};

const translations: any = {};

languageFiles.forEach((langFile) => {
  translations[langFile.key] = langFile.contents;
  // accept full key with region code or just the language code
  const bLang = getBaseLanguage(langFile.key);
  if (bLang && !translations[bLang]) {
    translations[bLang] = langFile.contents;
  }
});

const lang = getPageLanguage() || getFirstBrowserLanguage();
const baseLang = getBaseLanguage(lang || "");
const defaultLang = lang && translations[lang]
                    ? lang
                    : baseLang && translations[baseLang]
                      ? baseLang
                      : "en";

const translate = (key: string) => {
  return translations[defaultLang][key] || `UNKNOWN KEY: ${key}`;
};

export default translate;
