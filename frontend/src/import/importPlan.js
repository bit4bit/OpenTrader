// Import planning for screener CSVs (e.g. IBD Sector Leaders): pure
// mapping from a parsed file record to the pieces of one imported session
// — folder name from the file, session name, and the provenance note
// carrying every column of the row.

import { parseCsvTable } from './csv';

const MAX_SESSION_NAME = 100;

export function folderNameFromFileName(fileName) {
    const dot = fileName.lastIndexOf('.');
    const base = dot > 0 ? fileName.slice(0, dot) : fileName;
    return base.trim();
}

export function symbolColumnOf(headers) {
    return headers.find(header => header.trim().toLowerCase() === 'symbol') ?? null;
}

export function sessionNameFor(values, symbol) {
    const company = (values['Company Name'] ?? '').trim();
    const name = company ? `${symbol} · ${company}` : symbol;
    if (name.length <= MAX_SESSION_NAME) return name;
    return `${name.slice(0, MAX_SESSION_NAME - 1)}…`;
}

export function importNoteFor(values, fileName, importedAtLabel) {
    const metadata = Object.entries(values)
        .map(([header, value]) => `${header}: ${value}`)
        .join('\n');
    return `📥 Imported from "${fileName}" on ${importedAtLabel}\n\n${metadata}`;
}

export function importRowsFromCsv(text) {
    const { headers, records } = parseCsvTable(text);
    const symbolColumn = symbolColumnOf(headers);
    if (!symbolColumn) return null;
    return {
        headers,
        rows: records.map(values => {
            const symbol = (values[symbolColumn] ?? '').trim();
            return { symbol, values, name: sessionNameFor(values, symbol) };
        }),
    };
}

// Preview columns shown in the import dialog, fixed preference order,
// restricted to the columns the file actually has.
const PREFERRED_PREVIEW_COLUMNS = ['Company Name', 'Price', 'IBD Comp. Rating', 'RS Rating'];

export function previewColumnsOf(headers) {
    return PREFERRED_PREVIEW_COLUMNS.filter(name => headers.includes(name));
}
