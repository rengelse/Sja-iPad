# SJA Generator iPad – PWA

Dette er iPad-versjonen av SJA Generator. Den bruker samme kjerne/UI/PDF-generator som Windows-utgaven, men lagrer data lokalt i nettleserens IndexedDB og er bygget som en offline-first PWA.

## Distribusjon

Repo: `https://github.com/rengelse/Sja-iPad`

GitHub Actions bygger automatisk `ipad/` og publiserer `ipad/dist` til GitHub Pages ved push til `main`.

Første gang må GitHub Pages settes til **GitHub Actions** under repository Settings → Pages.

## Bruk på iPad

1. Åpne GitHub Pages-adressen i Safari mens iPaden har nett.
2. Vent til SJA Generator er lastet ferdig.
3. Del → Legg til på Hjem-skjerm → Åpne som nettapp.
4. Start SJA Generator fra ikonet.
5. Etter første fullførte innlasting er programfilene cachet lokalt og appen kan brukes offline.

SJA-dokumenter, personell og egne maler lagres lokalt på iPaden. PDF kan forhåndsvises og deles via iPadOS Share Sheet når nettleseren støtter fildeling.
