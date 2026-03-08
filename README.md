# Products TAM Viewer

Local/internal Next.js app for importing and viewing Total Addressable Market (TAM) spreadsheet data.

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
   - TAM table: `http://localhost:3000/tam`

## TAM Import CLI

```bash
npm run import:tam -- --input <path> --sheet <name?> --output <path?>
```

- `--input`: optional; defaults to first existing file in:
  - `data/raw/tam.xlsx`
  - `data/raw/tam.csv`
  - `data/raw/tam.xls`
- `--sheet`: optional preferred sheet name (default: `TAM`), falls back to first sheet if missing.
- `--output`: optional output snapshot path (default: `data/tam.snapshot.json`).

## Snapshot Contract

`data/tam.snapshot.json`:

- `columns: string[]`
- `rows: Record<string, string | number | boolean | null>[]`
- `generatedAt: string` (ISO timestamp)
- `sourceFile: string`
- `rowCount: number`

## Tests

Run:

```bash
npm test
```

Coverage includes:

- Import parser behavior (headers/rows, TAM fallback, deterministic output)
- Snapshot loading states (missing/malformed/valid)
- UI table interactions (columns, filtering, sorting, pagination, empty state)
