import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import TopBar from './components/TopBar';
import ChartGrid from './components/ChartGrid';
import IndicatorSearch from './components/IndicatorSearch';
import SymbolSearch from './components/SymbolSearch';
import SymbolCatalogModal from './components/SymbolCatalogModal';
import DrawingToolbar from './components/DrawingToolbar';
import LoginScreen from './components/LoginScreen';
import CustomIndicatorModal from './components/CustomIndicatorModal';
import PositionsModal from './components/PositionsModal';
import NotesModal from './components/NotesModal';
import SessionNote from './components/SessionNote';
import { useAuth } from './hooks/useAuth';
import { useSessions } from './hooks/useSessions';
import { useCharts } from './hooks/useCharts';
import { useCustomIndicators } from './hooks/useCustomIndicators';
import { usePositions } from './hooks/usePositions';
import { useNotes } from './hooks/useNotes';
import { legacyNotePayload } from './notes/importLegacy';
import useDrawingToolShortcuts from './hooks/useDrawingToolShortcuts';
import { addIndicators, addCustomIndicator, updateIndicator as updateIndicatorIn, removeIndicator as removeIndicatorIn, toggleIndicator as toggleIndicatorIn } from './Indicators/actions';

const FIRST_VISIT_KEY = 'opentrader_first_visit';

function Workspace({ initialLayout, sessionId, saveLayout, sessionProps, customIndicators, positionsState, notesState }) {
  const {
    charts,
    activeChartId,
    locked,
    gridLayout,
    setGridLayout,
    setActiveChartId,
    addChart,
    closeChart,
    closeAllCharts,
    updateChart,
    toggleLock,
  } = useCharts(initialLayout, useCallback(
    (layout) => saveLayout(sessionId, layout),
    [saveLayout, sessionId]
  ));

  const [showIndicatorSearch, setShowIndicatorSearch] = useState(false);
  const [showCustomIndicators, setShowCustomIndicators] = useState(false);
  const [showSymbolCatalog, setShowSymbolCatalog] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [showPositions, setShowPositions] = useState(false);
  const [showNotesManager, setShowNotesManager] = useState(false);
  const [pendingPickTime, setPendingPickTime] = useState(null);
  const [pickTarget, setPickTarget] = useState(null); // 'position' | 'note'
  const [symbolSearchMode, setSymbolSearchMode] = useState(null);
  const [activeTool, setActiveTool] = useState('cursor');
  const [magnetEnabled, setMagnetEnabled] = useState(false);
  const [toolbarVisible, setToolbarVisible] = useState(true);
  const [drawingToolbarVisible, setDrawingToolbarVisible] = useState(true);

  const activeChart = charts.find(c => c.id === activeChartId) || null;

  useEffect(() => {
    document.title = activeChart ? `Open trader - ${activeChart.symbol?.symbol || ''}` : 'Open trader';
  }, [activeChart]);

  const addIndicator = (type) => {
    if (!activeChart) return;
    updateChart(activeChart.id, c => ({ indicators: addIndicators(c.indicators, type) }));
  };

  const addCustomToChart = (script) => {
    if (!activeChart) return;
    updateChart(activeChart.id, c => ({ indicators: addCustomIndicator(c.indicators, script) }));
  };

  const patchActiveIndicators = (fn) => {
    if (!activeChart) return;
    updateChart(activeChart.id, c => ({ indicators: fn(c.indicators) }));
  };

  const handleSelectSymbol = (selection) => {
    const next = { symbol: selection.symbol, provider: selection.provider || null };
    if (symbolSearchMode === 'add') {
      addChart(next, selection.description || '');
    } else if (activeChart) {
      updateChart(activeChart.id, { symbol: next });
    }
  };

  const handleOpenInNewChart = (selection) => addChart(selection, selection.description || '');

  const handleSelectTool = (tool) => {
    if (tool === 'eraser') {
      if (activeChart && window.confirm('Delete all drawings?')) {
        updateChart(activeChart.id, { drawings: [] });
      }
      setActiveTool('cursor');
    } else {
      setActiveTool(tool);
    }
  };

  useDrawingToolShortcuts(handleSelectTool,
    !showIndicatorSearch && !showCustomIndicators && !showSymbolCatalog
    && !showNotes && !showPositions && !showNotesManager && activeTool !== 'datePick');

  // Date-pick flow: hide the modal, arm the date picker tool, and the
  // clicked candle's time re-opens the modal with the datetime prefilled.
  const openPositions = () => {
    setPendingPickTime(null);
    setPickTarget('position');
    setActiveTool('cursor');
    setShowPositions(true);
  };
  const openNotes = () => {
    setPendingPickTime(null);
    setPickTarget('note');
    setActiveTool('cursor');
    setShowNotesManager(true);
  };
  const pickDate = () => {
    setShowPositions(false);
    setShowNotesManager(false);
    setActiveTool('datePick');
  };
  const handleDatePicked = (time) => {
    setPendingPickTime(time);
    if (pickTarget === 'note') setShowNotesManager(true);
    else setShowPositions(true);
  };

  return (
    <>
      {toolbarVisible ? (
      <TopBar
        onToggleToolbar={() => setToolbarVisible(false)}
        symbol={activeChart?.symbol?.symbol || ''}
        symbolProvider={activeChart?.symbol?.provider || null}
        interval={activeChart?.interval || '1d'}
        chartType={activeChart?.chartType || 'candle'}
        showWeekendCandles={activeChart?.showWeekendCandles ?? false}
        hasActiveChart={!!activeChart}
        setInterval={(interval) => activeChart && updateChart(activeChart.id, { interval })}
        setChartType={(chartType) => activeChart && updateChart(activeChart.id, { chartType })}
        onToggleWeekendCandles={() => activeChart && updateChart(activeChart.id, { showWeekendCandles: !activeChart.showWeekendCandles })}
        openIndicatorSearch={() => activeChart && setShowIndicatorSearch(true)}
        openCustomIndicators={() => setShowCustomIndicators(true)}
        openSymbolSearch={() => setSymbolSearchMode('change')}
        openSymbolCatalog={() => setShowSymbolCatalog(true)}
        gridLayout={gridLayout}
        onSetGridLayout={setGridLayout}
        onAddChart={() => setSymbolSearchMode('add')}
        onCloseAll={() => {
          if (charts.length > 0 && window.confirm('Close all charts?')) closeAllCharts();
        }}
        noteOpen={showNotes}
        onToggleNotes={() => setShowNotes(v => !v)}
        onOpenPositions={openPositions}
        {...sessionProps}
        onOpenNotes={openNotes}
      />
      ) : (
      <div className="top-bar top-bar-collapsed">
        <button
          className="toolbar-btn"
          onClick={() => setToolbarVisible(true)}
          title="Show toolbar"
        >
          <span style={{ fontSize: '14px' }}>🞃</span> Open Trader
        </button>
      </div>
      )}
      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        {activeChart && drawingToolbarVisible && (
          <DrawingToolbar
            activeTool={activeTool}
            onSelectTool={handleSelectTool}
            magnetEnabled={magnetEnabled}
            onToggleMagnet={() => setMagnetEnabled(m => !m)}
            locked={locked}
            onToggleLock={toggleLock}
            onHide={() => setDrawingToolbarVisible(false)}
          />
        )}
        {activeChart && !drawingToolbarVisible && (
          <button
            className="drawing-toolbar-show-btn"
            onClick={() => setDrawingToolbarVisible(true)}
            title="Show drawing tools"
          >
            ✏️
          </button>
        )}

        <ChartGrid
          charts={charts}
          activeChartId={activeChartId}
          locked={locked}
          gridLayout={gridLayout}
          onSetGridLayout={setGridLayout}
          activeTool={activeTool}
          setActiveTool={setActiveTool}
          magnetEnabled={magnetEnabled}
          onActivate={setActiveChartId}
          onClose={closeChart}
          onUpdate={updateChart}
          onAddChart={() => setSymbolSearchMode('add')}
          scriptsById={customIndicators.scriptsById}
          positions={positionsState.positions}
          notes={notesState.notes}
          onDatePick={handleDatePicked}
        />

        {activeTool === 'datePick' && (
          <div className="date-pick-hint">
            Click a candle to set the date &amp; time · Esc to cancel
          </div>
        )}

        {(showPositions || activeTool === 'datePick') && (
          <PositionsModal
            hidden={activeTool === 'datePick'}
            positionsState={positionsState}
            defaultSymbol={activeChart?.symbol?.symbol || ''}
            initialTime={pendingPickTime}
            canPickDate={!!activeChart}
            onPickDate={pickDate}
            onClose={() => setShowPositions(false)}
          />
        )}

        {(showNotesManager || activeTool === 'datePick') && (
          <NotesModal
            hidden={activeTool === 'datePick'}
            notesState={notesState}
            defaultSymbol={activeChart?.symbol?.symbol || ''}
            initialTime={pendingPickTime}
            canPickDate={!!activeChart}
            onPickDate={pickDate}
            onClose={() => setShowNotesManager(false)}
          />
        )}

        {showCustomIndicators && (
          <CustomIndicatorModal
            scripts={customIndicators.scripts}
            createScript={customIndicators.createScript}
            updateScript={customIndicators.updateScript}
            deleteScript={customIndicators.deleteScript}
            onAddToChart={activeChart ? addCustomToChart : null}
            onClose={() => setShowCustomIndicators(false)}
          />
        )}

        {showIndicatorSearch && (
          <IndicatorSearch
            indicators={activeChart?.indicators || []}
            chartSymbol={activeChart?.symbol?.symbol || ''}
            onAddIndicator={addIndicator}
            onUpdateIndicator={(id, updates) => patchActiveIndicators(list => updateIndicatorIn(list, id, updates))}
            onRemoveIndicator={(id) => patchActiveIndicators(list => removeIndicatorIn(list, id))}
            onToggleIndicator={(id) => patchActiveIndicators(list => toggleIndicatorIn(list, id))}
            scriptsById={customIndicators.scriptsById}
            onClose={() => setShowIndicatorSearch(false)}
          />
        )}

        {showSymbolCatalog && (
          <SymbolCatalogModal
            onSelectSymbol={handleSelectSymbol}
            onOpenInNewChart={handleOpenInNewChart}
            onClose={() => setShowSymbolCatalog(false)}
          />
        )}

        {symbolSearchMode && (
          <SymbolSearch
            onSelectSymbol={handleSelectSymbol}
            onOpenInNewChart={handleOpenInNewChart}
            onClose={() => setSymbolSearchMode(null)}
          />
        )}

        {showNotes && sessionProps.activeSession && (
          <SessionNote
            notes={sessionProps.activeSession.notes || ''}
            onChange={(notes) => sessionProps.onSaveNotes(sessionId, notes)}
            onClose={() => setShowNotes(false)}
          />
        )}
      </div>
    </>
  );
}

function App() {
  const { token, username, login, logout } = useAuth();
  const {
    sessions,
    folders,
    activeSession,
    activeFolderId,
    createSession,
    renameSession,
    deleteSession,
    switchSession,
    toggleFavoriteSession,
    togglePortfolioSession,
    setSessionStage,
    saveLayout,
    saveNotes,
    globalNote,
    showSessionQuotes,
    toggleSessionQuotes,
    createFolder,
    renameFolder,
    deleteFolder,
    moveSession,
    setActiveFolder,
    loaded,
  } = useSessions(!!token, logout);

  const customIndicators = useCustomIndicators(!!token);
  const positionsState = usePositions(!!token);
  const notesState = useNotes(!!token);

  // One-time import of the retired 🌍 global note (UserPreference.note):
  // it becomes an undated journal note tagged 'imported', then the
  // preference note is cleared. Without a note there is nothing to do.
  const { addNote } = notesState;
  const importedLegacyNote = useRef(false);
  useEffect(() => {
    const text = (globalNote || '').trim();
    if (!token || !loaded || !text || importedLegacyNote.current) return;
    importedLegacyNote.current = true;
    addNote(legacyNotePayload(text))
      .catch(err => {
        console.warn('Failed to import the legacy global note:', err);
        importedLegacyNote.current = false;
      })
      .then(() => {
        if (importedLegacyNote.current) {
          axios.patch('/api/preferences/', { note: '' })
            .catch(err => console.warn('Failed to clear the legacy global note:', err));
        }
      });
  }, [token, loaded, globalNote, addNote]);
  const [showAppNotes, setShowAppNotes] = useState(false);
  const [showWelcome, setShowWelcome] = useState(() => {
    const visited = localStorage.getItem(FIRST_VISIT_KEY);
    if (!visited) {
      localStorage.setItem(FIRST_VISIT_KEY, 'false');
      return true;
    }
    return false;
  });

  if (!token) {
    return <LoginScreen onLogin={login} />;
  }

  const sessionProps = {
    sessions,
    folders,
    activeSession,
    activeFolderId,
    onSwitchSession: switchSession,
    onCreateSession: (name, folderId) => createSession(name.trim(), folderId === undefined ? activeFolderId : folderId),
    onRenameSession: (id, name) => renameSession(id, name),
    onDeleteSession: (id) => {
      const session = sessions.find(s => s.id === id);
      if (session && window.confirm(`Delete session "${session.name}"?`)) {
        deleteSession(id);
      }
    },
    onToggleFavorite: (id) => toggleFavoriteSession(id),
    onTogglePortfolio: (id) => togglePortfolioSession(id),
    onSetSessionStage: (id, stage) => setSessionStage(id, stage),
    showQuotes: showSessionQuotes,
    onToggleQuotes: toggleSessionQuotes,
    onCreateFolder: (name) => createFolder(name.trim()),
    onRenameFolder: (id, name) => renameFolder(id, name),
    onDeleteFolder: (id) => {
      const folder = folders.find(f => f.id === id);
      if (folder && window.confirm(`Delete folder "${folder.name}"? Sessions inside are kept.`)) {
        deleteFolder(id);
      }
    },
    onMoveSession: moveSession,
    onSetActiveFolder: setActiveFolder,
    onSaveNotes: saveNotes,
    username,
    onLogout: logout,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      {showAppNotes && (
        <NotesModal
          notesState={notesState}
          onClose={() => setShowAppNotes(false)}
        />
      )}
      {showWelcome && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
        }}>
          <div style={{
            backgroundColor: '#1a1a2e',
            color: '#fff',
            padding: '32px',
            borderRadius: '12px',
            maxWidth: '500px',
            textAlign: 'center',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
            border: '1px solid #333',
          }}>
            <h2 style={{ margin: '0 0 16px 0', fontSize: '24px', color: '#4fc3f7' }}>Welcome to Open Trader!</h2>
            <p style={{ margin: '0 0 12px 0', lineHeight: '1.6', fontSize: '14px' }}>
              Open Trader is an open-source tool for viewing stock and crypto market data, as well as using indicators and drawing tools to perform analysis.
            </p>
            <p style={{ margin: '0 0 16px 0', lineHeight: '1.6', fontSize: '14px' }}>
              The project is still in its early stages, so you may encounter bugs. If you do, please raise an issue on GitHub. Thanks, and have a blast trading!
            </p>
            <p style={{ margin: '0 0 24px 0', fontSize: '14px', color: '#ff6b6b' }}>Made with ❤️ from India</p>
            <button
              onClick={() => setShowWelcome(false)}
              style={{
                backgroundColor: '#4fc3f7',
                color: '#000',
                border: 'none',
                padding: '12px 32px',
                borderRadius: '6px',
                fontSize: '16px',
                fontWeight: 'bold',
                cursor: 'pointer',
                transition: 'background-color 0.2s',
              }}
              onMouseOver={(e) => e.target.style.backgroundColor = '#29b6f6'}
              onMouseOut={(e) => e.target.style.backgroundColor = '#4fc3f7'}
            >
              Let's Go!
            </button>
          </div>
        </div>
      )}
      {activeSession ? (
        <Workspace
          key={activeSession.id}
          initialLayout={activeSession.layout}
          sessionId={activeSession.id}
          saveLayout={saveLayout}
          sessionProps={sessionProps}
          customIndicators={customIndicators}
          positionsState={positionsState}
          notesState={notesState}
        />
      ) : (
        <>
          <TopBar hasActiveChart={false} {...sessionProps} onOpenNotes={() => setShowAppNotes(true)} />
          {showAppNotes && (
            <NotesModal
              notesState={notesState}
              onClose={() => setShowAppNotes(false)}
            />
          )}
          <div style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#888',
            backgroundColor: '#0f0f1a',
          }}>
            {loaded ? 'No session selected. Create one from the session menu.' : 'Loading…'}
          </div>
        </>
      )}
    </div>
  );
}

export default App;
