import { describe, it, expect } from 'vitest';
import { parseCsvRows, parseCsvTable } from '../csv';

describe('parseCsvRows', () => {
    it('splits plain comma rows', () => {
        expect(parseCsvRows('a,b\n1,2')).toEqual([['a', 'b'], ['1', '2']]);
    });

    it('keeps commas inside quoted fields', () => {
        expect(parseCsvRows('"Paysign, Inc.",15.36')).toEqual([['Paysign, Inc.', '15.36']]);
    });

    it('unescapes doubled quotes', () => {
        expect(parseCsvRows('"say ""hello""",x')).toEqual([['say "hello"', 'x']]);
    });

    it('treats a quote mid-field as literal', () => {
        expect(parseCsvRows('a"b,c')).toEqual([['a"b', 'c']]);
    });

    it('handles CRLF line endings', () => {
        expect(parseCsvRows('a,b\r\n1,2\r\n')).toEqual([['a', 'b'], ['1', '2']]);
    });

    it('skips blank lines and keeps a lone quoted empty field', () => {
        expect(parseCsvRows('a,b\n\n,x\n1,2')).toEqual([['a', 'b'], ['', 'x'], ['1', '2']]);
    });

    it('returns no rows for empty input', () => {
        expect(parseCsvRows('')).toEqual([]);
        expect(parseCsvRows('\n\n')).toEqual([]);
    });
});

describe('parseCsvTable', () => {
    const IBD_LINE = 'Symbol,Company Name,Price\nPAYS,Paysign Inc.,15.36';

    it('maps rows onto header keys in column order', () => {
        expect(parseCsvTable(IBD_LINE)).toEqual({
            headers: ['Symbol', 'Company Name', 'Price'],
            records: [{ 'Symbol': 'PAYS', 'Company Name': 'Paysign Inc.', 'Price': '15.36' }],
        });
    });

    it('fills missing trailing cells with empty strings', () => {
        expect(parseCsvTable('a,b\n1'))
            .toEqual({ headers: ['a', 'b'], records: [{ a: '1', b: '' }] });
    });

    it('returns no records for a header-only file', () => {
        expect(parseCsvTable('Symbol,Price\n')).toEqual({ headers: ['Symbol', 'Price'], records: [] });
    });
});
