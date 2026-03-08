# Products TAM Viewer

Local/internal Next.js app for importing and viewing Total Addressable Market (TAM) spreadsheet data.
Embedded workbook images are extracted and shown as row thumbnails in the table.
The UI supports inline editing, image upload per row, and adding new columns.

## Prerequisites

- Node.js 20+
- npm 10+

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Export your Google Sheet to one of:
   - `data/raw/tam.xlsx` (preferred)
   - `data/raw/tam.csv`
3. Import TAM data into committed snapshot JSON:
   ```bash
   npm run import:tam -- --input "data/raw/tam.xlsx" --sheet TAM
   ```
4. Start the app:
   ```bash
   npm run dev
   ```
5. Open:
   - Home: `http://localhost:3000`
   - TAM 1 table: `http://localhost:3000/tam`
   - TAM 2 table: `http://localhost:3000/tam-2`

Each page supports worksheet tabs via query param, for example:

- `http://localhost:3000/tam?sheet=Substrates`

## TAM Import CLI

```bash
npm run import:tam -- --input <path> --sheet <name?> --output <path?>
```

- `--input`: optional; defaults to first existing file in:
  - `data/raw/tam.xlsx`
  - `data/raw/tam.csv`
  - `data/raw/tam.xls`
- `--sheet`: optional preferred/default sheet name for UI (default: `TAM`), falls back to first sheet if missing.
- `--output`: optional output snapshot path (default: `data/tam.snapshot.json`).
- Embedded worksheet images are automatically extracted to `public/tam-assets/<dataset>/` and linked in each row.

Second dataset helper command:

```bash
npm run import:tam:2
```

This expects `data/raw/tam-2.xlsx` and writes `data/tam-2.snapshot.json`.

## Snapshot Contract

`data/tam.snapshot.json`:

- `defaultSheet: string`
- `sheets: { name, columns, rows, rowCount }[]`
- `generatedAt: string` (ISO timestamp)
- `sourceFile: string`

## Tests

Run:

```bash
npm test
```

Coverage includes:

- Import parser behavior (headers/rows, TAM fallback, deterministic output)
- Snapshot loading states (missing/malformed/valid)
- UI table interactions (editable columns/cells, sorting, pagination, upload controls)
