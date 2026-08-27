# Bijdragen

Bedankt voor je interesse. Deze repository is **bron-inzage
(source-available), geen open source**: lezen en bestuderen mag iedereen,
gebruiken mag met een geldige Agentic Team-licentie. Zie [LICENSE](LICENSE)
(Nederlands, leidend) en [LICENSE.en.md](LICENSE.en.md) (Engelse vertaling).

**Wat hier zinvol is om bij te dragen.** `src/`, `schema/`, `test/`,
`scripts/` en de documentatie. Let op: `dashboard.html` en de CSP-hashes in
`vercel.json` zijn **gegenereerd** — pas `src/`/`schema/` aan en draai
`python3 scripts/build.py`; commit het gebouwde bestand mee (de CI-poort
`build-drift` faalt anders). `schema/schema.generated.js` komt uit de
privé-repo `agent-architecture` en wordt gesynchroniseerd, niet met de hand
bewerkt.

## De regel: onderteken je commits (DCO 1.1)

Elke commit in een pull request moet een `Signed-off-by`-regel bevatten. Dat
is je verklaring onder de **Developer Certificate of Origin 1.1** én onder
**artikel 2d van de LICENSE**: je bent gerechtigd de bijdrage te leveren, je
verleent Licentiegever de daar omschreven rechten (inclusief de
octrooilicentie) en je doet — voor zover de wet dat toelaat — afstand van het
recht je te verzetten tegen wijziging van je bijdrage, met behoud van het
recht op naamsvermelding.

Ondertekenen doe je met `-s`:

```shell
git commit -s -m "fix: typo in de README"
```

Git zet dan zelf de regel eronder, met de naam en het e-mailadres uit je
Git-configuratie:

```
Signed-off-by: Jouw Naam <jij@voorbeeld.nl>
```

Gebruik je echte naam en een e-mailadres dat aan je GitHub-account is
gekoppeld — het `@users.noreply.github.com`-adres van GitHub mag, een
pseudoniem of een adres waarop je niet bereikbaar bent niet.

**Vergeten?**

```shell
git commit --amend -s --no-edit          # laatste commit
git rebase --signoff origin/main         # alle commits in je branch
```

Daarna `git push --force-with-lease`.

**Altijd aan zetten** (per repo):

```shell
git config format.signOff true
```

Een GitHub Action (`.github/workflows/dco.yml`) controleert bij elke pull
request dat élke commit een `Signed-off-by`-regel heeft. Zonder die regel
faalt de check en wordt de bijdrage niet samengevoegd.

## Developer Certificate of Origin 1.1

De onderstaande tekst is de officiële, onveranderde DCO 1.1 (bron:
<https://developercertificate.org/>, SPDX: `DCO-1.1`). Hij staat hier in het
Engels omdat dat de authentieke tekst is.

```
Developer Certificate of Origin
Version 1.1

Copyright (C) 2004, 2006 The Linux Foundation and its contributors.

Everyone is permitted to copy and distribute verbatim copies of this
license document, but changing it is not allowed.


Developer's Certificate of Origin 1.1

By making a contribution to this project, I certify that:

(a) The contribution was created in whole or in part by me and I
    have the right to submit it under the open source license
    indicated in the file; or

(b) The contribution is based upon previous work that, to the best
    of my knowledge, is covered under an appropriate open source
    license and I have the right under that license to submit that
    work with modifications, whether created in whole or in part
    by me, under the same open source license (unless I am
    permitted to submit under a different license), as indicated
    in the file; or

(c) The contribution was provided directly to me by some other
    person who certified (a), (b) or (c) and I have not modified
    it.

(d) I understand and agree that this project and the contribution
    are public and that a record of the contribution (including all
    personal information I submit with it, including my sign-off) is
    maintained indefinitely and may be redistributed consistent with
    this project or the open source license(s) involved.
```

**Let op — twee kanttekeningen bij deze tekst:**

1. De DCO 1.1 spreekt van "the open source license indicated in the file".
   Deze repository is niet open source; lees op die plaatsen **de licentie
   die in [LICENSE](LICENSE) staat**. Wat je verklaart, is dus: je mag deze
   bijdrage leveren onder díe licentie.
2. Onderdeel (d) betekent dat je naam en e-mailadres uit de
   `Signed-off-by`-regel permanent en publiek in de Git-historie staan. Dat
   is de bedoeling: het is het auditspoor per commit.

## Wat je verder van ons kunt verwachten

- **Werkwijze.** Open eerst een issue als je iets groters wilt aanpakken —
  dan weet je vooraf of het past. Kleine correcties (typo's, kapotte links,
  duidelijke bugs) mogen meteen als pull request.
- **Geen code van derden.** Plak geen code, fonts, iconen of voorbeelden van
  buiten deze repository in een bijdrage zonder dat expliciet te melden. Er
  hangt een attributieplicht aan (en aan fonts en icoonsets vrijwel altijd),
  en dat raakt rechtstreeks aan wat [NOTICE](NOTICE) belooft.
- **Geen klant- of persoonsgegevens** in code, tests, fixtures of
  commitberichten.
- **Beveiliging.** Meld een kwetsbaarheid niet in een issue, maar per e-mail
  aan support@agentic-team.ai.
- **Accepteren is geen recht.** Licentiegever beslist of een bijdrage wordt
  overgenomen; ook een goede bijdrage kan buiten de koers vallen.

Vragen: support@agentic-team.ai · [agentic-team.ai](https://www.agentic-team.ai)
