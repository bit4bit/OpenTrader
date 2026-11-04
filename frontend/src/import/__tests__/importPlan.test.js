import { describe, it, expect } from 'vitest';
import {
    folderNameFromFileName,
    symbolColumnOf,
    sessionNameFor,
    importNoteFor,
    importRowsFromCsv,
    previewColumnsOf,
} from '../importPlan';

const IBD_CSV = `Symbol,Company Name,Price,Price $ Change,Price % Change,IBD Comp. Rating,EPS Rating,RS Rating,Ind Grp RS,SMR Rating,Acc/Dis Rating,Vol. % Change,Vol. (1000s)
PAYS,Paysign Inc.,15.36,0.23,1.52,99,98,99,A,A,C,21,627
,Row without symbol,1.00,0,0,50,50,50,B,B,C,1,100`;

describe('folderNameFromFileName', () => {
    it('strips the extension and trims', () => {
        expect(folderNameFromFileName('IBD Sector Leaders.csv')).toBe('IBD Sector Leaders');
        expect(folderNameFromFileName('  leaders.CSV ')).toBe('leaders');
    });

    it('keeps extension-less names as-is', () => {
        expect(folderNameFromFileName('IBD Sector Leaders')).toBe('IBD Sector Leaders');
    });
});

describe('symbolColumnOf', () => {
    it('matches case-insensitively', () => {
        expect(symbolColumnOf(['Ticker', 'symbol', 'Price'])).toBe('symbol');
        expect(symbolColumnOf(['Ticker', 'Price'])).toBeNull();
    });
});

describe('sessionNameFor', () => {
    it('combines symbol and company', () => {
        expect(sessionNameFor({ 'Company Name': 'Paysign Inc.' }, 'PAYS')).toBe('PAYS · Paysign Inc.');
    });

    it('falls back to the symbol without a company column', () => {
        expect(sessionNameFor({}, 'PAYS')).toBe('PAYS');
    });

    it('truncates long names to 100 chars', () => {
        const name = sessionNameFor({ 'Company Name': 'x'.repeat(150) }, 'LONG');
        expect(name.length).toBe(100);
        expect(name.endsWith('…')).toBe(true);
    });
});

describe('importNoteFor', () => {
    it('carries the file, timestamp and every column', () => {
        const note = importNoteFor(
            { 'Symbol': 'PAYS', 'Company Name': 'Paysign Inc.', 'Price': '15.36' },
            'IBD Sector Leaders.csv',
            '11/4/2026, 2:32:11 PM');
        expect(note).toBe(
            '📥 Imported from "IBD Sector Leaders.csv" on 11/4/2026, 2:32:11 PM\n\n' +
            'Symbol: PAYS\nCompany Name: Paysign Inc.\nPrice: 15.36');
    });
});

describe('importRowsFromCsv', () => {
    it('builds one row per CSV record', () => {
        const plan = importRowsFromCsv(IBD_CSV);
        expect(plan.headers[0]).toBe('Symbol');
        expect(plan.rows).toHaveLength(2);
        expect(plan.rows[0]).toEqual({
            symbol: 'PAYS',
            name: 'PAYS · Paysign Inc.',
            values: expect.objectContaining({ 'Symbol': 'PAYS', 'Price': '15.36', 'RS Rating': '99' }),
        });
    });

    it('returns null when the file has no Symbol column', () => {
        expect(importRowsFromCsv('Ticker,Price\nPAYS,15.36')).toBeNull();
    });
});

describe('previewColumnsOf', () => {
    it('keeps only the columns the file actually has, in preference order', () => {
        const headers = ['Symbol', 'Price', 'RS Rating'];
        expect(previewColumnsOf(headers)).toEqual(['Price', 'RS Rating']);
        expect(previewColumnsOf(['Symbol'])).toEqual([]);
    });
});
