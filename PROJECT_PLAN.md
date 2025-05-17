# Projekt: AI Tab Sorter - Chrome Rozšírenie

**Cieľ:** Vytvoriť Chrome rozšírenie, ktoré inteligentne triedi a zoskupuje otvorené karty prehliadača pomocou OpenAI API (`gpt-4o`), pričom umožňuje používateľom definovať vlastné pravidlá a prispôsobiť správanie AI.

**Kľúčové funkcie:**

1.  **Získavanie informácií o kartách:** Rozšírenie načíta názvy a URL všetkých otvorených kariet (okrem pripnutých, prípadne konfigurovateľné).
2.  **Komunikácia s OpenAI API:** Bezpečné odosielanie dát o kartách a používateľských nastavení na `gpt-4o` a spracovanie odpovede.
3.  **Používateľom definované skupiny:**
    *   Možnosť vytvárať, upravovať a mazať skupiny definované názvom a popisom.
    *   Tieto popisy slúžia ako inštrukcie pre AI.
4.  **Režimy triedenia:**
    *   **Rešpektovať používateľské skupiny:** AI primárne priraďuje karty k existujúcim používateľským skupinám. Pre karty, ktoré nezapadajú do žiadnej definovanej skupiny, AI autonómne vytvorí nové skupiny.
    *   **Autonómne AI triedenie:** Používateľ môže povoliť AI, aby úplne autonómne analyzovala všetky karty a navrhla štruktúru skupín.
5.  **Globálny používateľský prompt:** Možnosť nastaviť globálny prompt v UI, ktorý usmerňuje AI pri triedení (napr. "Zoskupuj karty podľa témy projektu a priority.").
6.  **Správa kariet:**
    *   Preskupenie kariet do nových okien alebo skupín kariet (Chrome Tab Groups API) na základe návrhu AI.
    *   Možnosť zobraziť náhľad navrhovaného zoskupenia pred aplikovaním zmien.
7.  **Používateľské rozhranie (UI):**
    *   Popup okno rozšírenia pre rýchle spustenie triedenia a prístup k nastaveniam.
    *   Stránka s nastaveniami pre správu OpenAI API kľúča, používateľských skupín, globálneho promptu a preferencií správania.
8.  **Inicializácia Git:** Repozitár bude inicializovaný na začiatku projektu.

### Architektúra a Technológie

*   **Jazyky:** JavaScript (čistý JavaScript), HTML, CSS.
*   **Chrome Extension APIs:**
    *   `chrome.tabs` na čítanie a manipuláciu s kartami.
    *   `chrome.storage` na ukladanie nastavení (API kľúč, pravidlá, prompt).
    *   `chrome.tabGroups` na prácu so skupinami kariet.
    *   `chrome.runtime` pre komunikáciu medzi časťami rozšírenia.
*   **OpenAI API:** `gpt-4o` model.
*   **Štruktúra rozšírenia:**
    *   **Popup (`popup.html`, `popup.js`, `popup.css`):** Hlavné rozhranie pre interakciu.
    *   **Background Script (`background.js`):** Spracovanie na pozadí, komunikácia s API, správa stavu.
    *   **Options Page (`options.html`, `options.js`, `options.css`):** Stránka pre detailné nastavenia.
    *   **Manifest File (`manifest.json`):** Konfigurácia rozšírenia.

### Mermaid Diagram Architektúry

```mermaid
graph TD
    subgraph User Interface
        Popup[Popup (popup.html/js)]
        OptionsPage[Options Page (options.html/js)]
    end

    subgraph Core Logic
        BackgroundScript[Background Script (background.js)]
        Storage[Chrome Storage API (settings, rules)]
        OpenAI_API[OpenAI API (gpt-4o)]
    end

    subgraph Browser Interaction
        TabsAPI[Chrome Tabs API]
        TabGroupsAPI[Chrome Tab Groups API]
    end

    Popup -- Trigger Sort/Settings --> BackgroundScript
    OptionsPage -- Save Settings/Rules --> BackgroundScript
    BackgroundScript -- Load Settings/Rules --> Storage
    BackgroundScript -- Save Settings/Rules --> Storage
    BackgroundScript -- Get Tab Info --> TabsAPI
    BackgroundScript -- Send Data for Sorting --> OpenAI_API
    OpenAI_API -- Return Sorted Groups --> BackgroundScript
    BackgroundScript -- Apply Grouping --> TabGroupsAPI
    BackgroundScript -- Update UI --> Popup
    BackgroundScript -- Update UI --> OptionsPage

    User[User] -- Interacts --> Popup
    User -- Interacts --> OptionsPage
```

### Postup Vývoja (Hlavné Kroky)

1.  **Inicializácia projektu a Git:**
    *   Vytvorenie základnej adresárovej štruktúry.
    *   Inicializácia Git repozitára (`git init`).
    *   Vytvorenie základného `manifest.json`.
2.  **Základné UI:**
    *   Vytvorenie jednoduchého `popup.html` s tlačidlom na spustenie.
    *   Vytvorenie základnej stránky `options.html`.
3.  **Práca s kartami:**
    *   Implementácia v `background.js` alebo `popup.js` na načítanie otvorených kariet (`chrome.tabs.query`).
4.  **Nastavenia a ukladanie dát:**
    *   Implementácia ukladania a načítania OpenAI API kľúča cez `chrome.storage` na stránke `options.html`.
    *   Implementácia UI pre definovanie používateľských skupín (názov, popis) a ich ukladanie.
    *   Implementácia UI pre nastavenie globálneho používateľského promptu.
5.  **Integrácia OpenAI API:**
    *   Funkcia v `background.js` na zostavenie promptu pre OpenAI (zoznam kariet, používateľské skupiny, globálny prompt).
    *   Odoslanie požiadavky na OpenAI API a spracovanie odpovede.
    *   Zabezpečenie API kľúča.
6.  **Logika triedenia a zoskupovania:**
    *   Spracovanie odpovede od AI a transformácia na príkazy pre `chrome.tabGroups` API.
    *   Implementácia dvoch režimov triedenia (rešpektovanie skupín vs. autonómne AI).
7.  **Aplikácia zmien na karty:**
    *   Použitie `chrome.tabGroups.update` a `chrome.tabs.group` na preskupenie kariet.
    *   Možnosť náhľadu pred aplikovaním.
8.  **Vylepšenia UI/UX:**
    *   Zobrazenie stavu (načítavanie, triedenie).
    *   Spätná väzba pre používateľa.
    *   Error handling.
9.  **Testovanie:**
    *   Manuálne testovanie rôznych scenárov.
    *   Testovanie s rôznym počtom kariet a typmi obsahu.
10. **Dokumentácia a príprava na publikovanie (ak je cieľom):**
    *   Vytvorenie `README.md`.
    *   Príprava ikon a popisov pre Chrome Web Store.