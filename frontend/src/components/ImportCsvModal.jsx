import React, { useState, useRef, useMemo, useEffect } from 'react';
import { importRowsFromCsv, folderNameFromFileName, importNoteFor, previewColumnsOf } from '../import/importPlan';
import { sessionSymbols } from '../quotes/quoteRow';

const ImportCsvModal = ({
    sessions,
    folders,
    onCreateFolder,
    onImportSessions,
    onImported,
    onClose,
}) => {
    const [file, setFile] = useState(null); // { name, plan }
    const [fileError, setFileError] = useState('');
    const [selected, setSelected] = useState(new Set());
    const [folderMode, setFolderMode] = useState('new');
    const [newFolderName, setNewFolderName] = useState('');
    const [existingFolderId, setExistingFolderId] = useState('');
    const [templateId, setTemplateId] = useState('');
    const [progress, setProgress] = useState(null);
    const [failures, setFailures] = useState(null);
    const [importError, setImportError] = useState('');
    const fileInputRef = useRef(null);
    const busy = progress != null;

    useEffect(() => {
        const onKey = (e) => { if (!busy && e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [busy, onClose]);

    const plan = file?.plan ?? null;
    const selectableIndexes = useMemo(
        () => (plan ? plan.rows.map((row, index) => (row.symbol !== '' ? index : null)).filter(index => index !== null) : []),
        [plan],
    );
    const previewColumns = useMemo(() => (plan ? previewColumnsOf(plan.headers) : []), [plan]);

    const loadFile = async (picked) => {
        if (!picked) return;
        const text = (await picked.text()).replace(/^\uFEFF/, '');
        const parsed = importRowsFromCsv(text);
        setFailures(null);
        setImportError('');
        setSelected(new Set());
        setTemplateId('');
        if (!parsed || parsed.rows.length === 0) {
            setFile({ name: picked.name, plan: null });
            setFileError(!parsed
                ? "No Symbol column found — the file needs a 'Symbol' header"
                : 'No stock rows found in the file');
            return;
        }
        setFileError('');
        setFile({ name: picked.name, plan: parsed });
        setNewFolderName(folderNameFromFileName(picked.name));
        setFolderMode('new');
        setSelected(new Set(parsed.rows.map((row, index) => (row.symbol !== '' ? index : null)).filter(index => index !== null)));
    };

    const toggleRow = (index) => {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(index)) next.delete(index);
            else next.add(index);
            return next;
        });
    };

    const toggleAll = () => {
        setSelected(prev => (
            prev.size === selectableIndexes.length ? new Set() : new Set(selectableIndexes)
        ));
    };

    const templateSymbolsOf = (session) => sessionSymbols(session).map(entry => entry.symbol);

    const resolveFolderId = async () => {
        if (folderMode === 'existing') return Number(existingFolderId);
        const name = newFolderName.trim();
        const existing = folders.find(folder => folder.name.trim().toLowerCase() === name.toLowerCase());
        if (existing) return existing.id;
        const folder = await onCreateFolder(name);
        return folder.id;
    };

    const startImport = async () => {
        const importRows = selectableIndexes
            .filter(index => selected.has(index))
            .map(index => ({
                ...plan.rows[index],
                index,
                note: importNoteFor(plan.rows[index].values, file.name, new Date().toLocaleString()),
            }));
        setFailures(null);
        setImportError('');
        setProgress({ done: 0, total: importRows.length });
        try {
            const folderId = await resolveFolderId();
            const { importedRows, failures: rowFailures } = await onImportSessions(
                importRows,
                { folderId, templateSessionId: Number(templateId) },
                (done, total) => setProgress({ done, total }),
            );
            setProgress(null);
            if (rowFailures.length === 0) {
                onImported(folderId);
                onClose();
                return;
            }
            // Keep the dialog open with a failure summary; succeeded rows are
            // unchecked so a retry imports only what is still missing.
            setFailures(rowFailures);
            const importedIndexes = new Set(importedRows.map(row => row.index));
            setSelected(prev => new Set([...prev].filter(index => !importedIndexes.has(index))));
        } catch (err) {
            setProgress(null);
            setImportError(err?.response?.data?.error || err.message || 'Import failed');
        }
    };

    const canImport =
        !busy &&
        selectableIndexes.length > 0 &&
        selected.size > 0 &&
        templateId !== '' &&
        (folderMode === 'existing' ? existingFolderId !== '' : newFolderName.trim() !== '');

    const folderExists = folders.some(
        folder => folder.name.trim().toLowerCase() === newFolderName.trim().toLowerCase());

    const dropProps = {
        onDragOver: (e) => e.preventDefault(),
        onDrop: (e) => {
            e.preventDefault();
            if (!busy) loadFile(e.dataTransfer.files?.[0]);
        },
    };

    return (
        <div
            className="csv-import-backdrop"
            onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose(); }}
        >
            <div className="csv-import">
                <div className="csv-import-header">
                    <span className="csv-import-title">⬆ Import stocks from CSV</span>
                    <button className="session-manager-close" onClick={() => { if (!busy) onClose(); }} title="Close (Esc)">✕</button>
                </div>
                <div className="csv-import-body">
                    {!file && (
                        <div className="csv-import-drop" {...dropProps} onClick={() => fileInputRef.current?.click()}>
                            <span className="csv-import-drop-icon">📥</span>
                            <span>Drop a screener CSV here, or <span className="csv-import-link">choose a file</span></span>
                            <span className="csv-import-hint">
                                One session per row (e.g. an &quot;IBD Sector Leaders&quot; export) · a
                                &quot;Symbol&quot; column is required
                            </span>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".csv,text/csv"
                                style={{ display: 'none' }}
                                onClick={e => e.stopPropagation()}
                                onChange={e => { loadFile(e.target.files?.[0]); e.target.value = ''; }}
                            />
                        </div>
                    )}
                    {file && (
                        <>
                            <div className="csv-import-filebar">
                                <span>📄 {file.name}</span>
                                <button
                                    className="csv-import-change"
                                    onClick={() => { setFile(null); setFileError(''); }}
                                    disabled={busy}
                                >Choose another file</button>
                            </div>
                            {fileError && <div className="csv-import-error">{fileError}</div>}
                            {plan && (
                                <>
                                    <div className="csv-import-options">
                                        <span className="csv-import-label">Folder</span>
                                        <label className="csv-import-option">
                                            <input
                                                type="radio"
                                                name="csv-folder"
                                                checked={folderMode === 'new'}
                                                disabled={busy}
                                                onChange={() => setFolderMode('new')}
                                            />
                                            <input
                                                className="csv-import-folder-input"
                                                placeholder="New folder name"
                                                value={newFolderName}
                                                disabled={busy || folderMode !== 'new'}
                                                onChange={e => setNewFolderName(e.target.value)}
                                            />
                                        </label>
                                        <label className="csv-import-option">
                                            <input
                                                type="radio"
                                                name="csv-folder"
                                                checked={folderMode === 'existing'}
                                                disabled={busy}
                                                onChange={() => setFolderMode('existing')}
                                            />
                                            <select
                                                className="session-manager-select"
                                                value={existingFolderId}
                                                disabled={busy || folderMode !== 'existing'}
                                                onChange={e => setExistingFolderId(e.target.value)}
                                            >
                                                <option value="">Existing folder…</option>
                                                {folders.map(folder => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
                                            </select>
                                        </label>
                                        {folderMode === 'new' && newFolderName.trim() !== '' && folderExists && (
                                            <span className="csv-import-hint">Reuses the existing folder with this name</span>
                                        )}
                                        <span className="csv-import-label">Template session</span>
                                        <select
                                            className="session-manager-select"
                                            value={templateId}
                                            disabled={busy}
                                            onChange={e => setTemplateId(e.target.value)}
                                        >
                                            <option value="">Choose the session layout to clone for every stock…</option>
                                            {sessions.map(session => {
                                                const symbols = templateSymbolsOf(session);
                                                const multiSymbol = symbols.length > 1;
                                                return (
                                                    <option
                                                        key={session.id}
                                                        value={session.id}
                                                        disabled={multiSymbol}
                                                        title={multiSymbol ? 'Layouts with charts of several symbols cannot be re-pointed' : undefined}
                                                    >
                                                        {session.name}{symbols.length > 0 ? ` (${symbols.join(', ')})` : ''}
                                                    </option>
                                                );
                                            })}
                                        </select>
                                    </div>
                                    <div className="csv-import-tablewrap">
                                        <table className="csv-import-table">
                                            <thead>
                                                <tr>
                                                    <th className="csv-import-check">
                                                        <input
                                                            type="checkbox"
                                                            checked={selectableIndexes.length > 0 && selected.size === selectableIndexes.length}
                                                            disabled={busy}
                                                            onChange={toggleAll}
                                                            title={selected.size === selectableIndexes.length ? 'Unselect all' : 'Select all'}
                                                        />
                                                    </th>
                                                    <th>Symbol</th>
                                                    {previewColumns.map(column => <th key={column}>{column}</th>)}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {plan.rows.map((row, index) => {
                                                    const noSymbol = row.symbol === '';
                                                    return (
                                                        <tr key={index} className={noSymbol || !selected.has(index) ? 'csv-import-off' : undefined}>
                                                            <td className="csv-import-check">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={selected.has(index)}
                                                                    disabled={busy || noSymbol}
                                                                    onChange={() => toggleRow(index)}
                                                                    title={noSymbol ? 'Row has no symbol' : undefined}
                                                                />
                                                            </td>
                                                            <td className="csv-import-symbol">{row.symbol || <span className="csv-import-dim">—</span>}</td>
                                                            {previewColumns.map(column => <td key={column}>{row.values[column]}</td>)}
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                    {(importError || failures) && (
                                        <div className="csv-import-summary">
                                            <div className="csv-import-error">
                                                {importError || `Finished with ${failures.length} failure(s):`}
                                            </div>
                                            {failures && (
                                                <ul className="csv-import-failures">
                                                    {failures.map((failure, index) => (
                                                        <li key={index}>{failure.row.symbol || '(no symbol)'} — {failure.reason}</li>
                                                    ))}
                                                </ul>
                                            )}
                                        </div>
                                    )}
                                </>
                            )}
                        </>
                    )}
                </div>
                {plan && (
                    <div className="csv-import-footer">
                        <span className="csv-import-hint">
                            {selected.size} of {selectableIndexes.length} stocks selected · each becomes a session
                            cloned from the template with its charts re-pointed to the stock
                        </span>
                        <button
                            className="csv-import-btn"
                            disabled={!canImport}
                            onClick={startImport}
                        >
                            {busy
                                ? `Importing ${progress.done}/${progress.total}…`
                                : `Import ${selected.size} session${selected.size === 1 ? '' : 's'}`}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ImportCsvModal;
