Bíblia Portuguesa Mundial (porbrbsl), eBible.org. Public domain; draft translation under revision. Retrieved 2026-09-09 from https://ebible.org/Scriptures/porbrbsl_html.zip
Source SHA256: 5b60ae8b4102570ecbc1de78ddd7ac15f784087e4765c2b71b330e3489d393f5
Verse text and source notes extracted without editorial correction; navigation book names normalized. 66 shared books + 7 deuterocanonical + 2 separate Greek versions.

## Ethiopian Orthodox Tewahedo texts

1 Enoch, Jubilees and 1–3 Meqabyan: printed Ethiopian Orthodox Tewahedo Bible, encoded in TEI by Beta maṣāḥǝft (Universität Hamburg and Akademie der Wissenschaften in Hamburg), at revision ff9d4981eba2084c4914ca840ff323d85cbd2a1d. Per-book sources are linked in the reader and recorded in docs/data/ethiopic/books.json.

The Ge’ez data in docs/data/ethiopic are licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). The importer extracts the printed-Bible edition divisions, normalizes whitespace, labels the Jubilees prologue as section 0 and adds letter suffixes to distinguish repeated verse numbers in the source. Other edition divisions in the XML are not used.

To regenerate, download the five source XML files listed in import_ethiopic.ps1 from the pinned revision, save them as ENO.xml, JUB.xml, 1MQ.xml, 2MQ.xml and 3MQ.xml, and run `pwsh -File import_ethiopic.ps1 -SourceDirectory <directory>`.
