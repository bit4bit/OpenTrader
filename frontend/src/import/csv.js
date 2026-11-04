// CSV parsing for screener exports: quoted fields may contain commas and
// doubled quotes; rows end on \n or \r\n. Returns a header-keyed table.

export function parseCsvRows(text) {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    let i = 0;
    const pushField = () => { row.push(field); field = ''; };
    const pushRow = () => {
        pushField();
        if (row.length > 1 || row[0] !== '') rows.push(row);
        row = [];
    };
    while (i < text.length) {
        const char = text[i];
        if (inQuotes) {
            if (char === '"') {
                if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
                inQuotes = false;
                i += 1;
                continue;
            }
            field += char;
            i += 1;
            continue;
        }
        if (char === '"' && field === '') { inQuotes = true; i += 1; continue; }
        if (char === ',') { pushField(); i += 1; continue; }
        if (char === '\r') { i += 1; continue; }
        if (char === '\n') { pushRow(); i += 1; continue; }
        field += char;
        i += 1;
    }
    if (field !== '' || row.length > 0) pushRow();
    return rows;
}

export function parseCsvTable(text) {
    const [headers = [], ...body] = parseCsvRows(text);
    const records = body.map(cells => {
        const values = {};
        headers.forEach((header, index) => { values[header] = cells[index] ?? ''; });
        return values;
    });
    return { headers, records };
}
