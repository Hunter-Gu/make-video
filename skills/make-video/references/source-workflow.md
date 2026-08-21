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
