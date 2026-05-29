# Paper Ledger

A browser-based research paper tracker for storing paper titles, abstracts, keywords, and PDFs.

## Features

- Add, edit, and delete research paper entries
- Upload PDFs and keep them in local browser storage
- Autofill title, abstract, and keywords from readable PDFs
- Normalize keywords into comma-separated values
- Search by title, abstract, or keywords
- Open saved PDFs from the paper detail view

## Files

- `index.html` - app markup
- `styles.css` - responsive interface styles
- `app.js` - IndexedDB storage, PDF parsing, and app behavior

## Run Locally

Open `index.html` directly in a browser, or run:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.
