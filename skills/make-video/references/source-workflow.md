# Source-grounded videos

Configure source material in `video.config.json` after the production plan is
approved:

```json
{
  "sources": [
    {
      "id": "primary-book",
      "title": "Source title",
      "input": "sources/book.epub",
      "rights": "private study"
    }
  ]
}
```

Supported local types are Markdown, text, PDF, DOCX, and EPUB. Web sources use
`type: "web"` and `url`. PDF ingestion requires `pdftotext`; DOCX and EPUB
require `unzip`.

Run `scripts/ingest-sources.mjs <video-id>` from the project root. It writes
`src/<video-id>/sources/index.json`, preserving page or section locators and
paragraph IDs. Existing indexes are protected unless regeneration is explicit.

Use block IDs when recording support for narration claims and storyboard
scenes. Mark model interpretation separately from sourced fact. Do not treat an
illustrative reconstruction as documentary evidence, and record the supplied
rights status without inferring publication permission.

Record people, places, dates, events, concepts, verbatim quotations, and source
illustrations in `SOURCE_ANNOTATIONS.json`. Every entry references stable source
blocks. Illustrations also record canonical path, rights, whether reuse is
allowed, caption, and evidence status. Run `scripts/build-source-catalog.mjs
<video-id>` to validate the annotations and write `sources/catalog.json`.
Canonical illustrations must remain outside `public/`; use `assetLinks` for the
runtime copy or hard link.

Record claims in `src/<video-id>/CLAIMS.json`. Each claim has a stable ID,
`direct`, `paraphrase`, or `inference` type, covered `narrationIds`, and source
block IDs. Inferences may omit sources but need a disclosure. Run
`scripts/verify-claims.mjs <video-id>` to require coverage for every stable ID
in `SCRIPT.md`, validate references, and generate `SOURCES.md`.
