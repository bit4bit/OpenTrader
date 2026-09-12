import React, { useState, useEffect, useCallback } from 'react';
import TopBar from './components/TopBar';
import ChartGrid from './components/ChartGrid';
import IndicatorSearch from './components/IndicatorSearch';
import SymbolSearch from './components/SymbolSearch';
import SymbolCatalogModal from './components/SymbolCatalogModal';
import DrawingToolbar from './components/DrawingToolbar';
import LoginScreen from './components/LoginScreen';
import CustomIndicatorModal from './components/CustomIndicatorModal';
import { useAuth } from './hooks/useAuth';
import { useSessions } from './hooks/useSessions';
import { useCharts } from './hooks/useCharts';
import { useCustomIndicators } from './hooks/useCustomIndicators';
import { addIndicators, addCustomIndicator } from './Indicators/actions';

const FIRST_VISIT_KEY = 'opentrader_first_visit';

function Workspace({ initialLayout, sessionId, saveLayout, sessionProps, customIndicators }) {
  const {
    charts,
    activeChartId,
    locked,
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
  const [symbolSearchMode, setSymbolSearchMode] = useState(null);
  const [activeTool, setActiveTool] = useState('cursor');

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

  const handleSelectSymbol = (selection) => {
    const next = typeof selection === 'string' ? { symbol: selection, provider: null } : selection;
    if (symbolSearchMode === 'add') {
      addChart(next);
    } else if (activeChart) {
      updateChart(activeChart.id, { symbol: next });
    }
  };

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

  return (
    <>
      <TopBar
        symbol={activeChart?.symbol?.symbol || ''}
        symbolProvider={activeChart?.symbol?.provider || null}
        interval={activeChart?.interval || '1d'}
        chartType={activeChart?.chartType || 'candle'}
        hasActiveChart={!!activeChart}
        setInterval={(interval) => activeChart && updateChart(activeChart.id, { interval })}
        setChartType={(chartType) => activeChart && updateChart(activeChart.id, { chartType })}
        openIndicatorSearch={() => activeChart && setShowIndicatorSearch(true)}
        openCustomIndicators={() => setShowCustomIndicators(true)}
        openSymbolSearch={() => setSymbolSearchMode('change')}
        openSymbolCatalog={() => setShowSymbolCatalog(true)}
        locked={locked}
        onToggleLock={toggleLock}
        onAddChart={() => setSymbolSearchMode('add')}
        onCloseAll={() => {
          if (charts.length > 0 && window.confirm('Close all charts?')) closeAllCharts();
        }}
        {...sessionProps}
      />
      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        {activeChart && (
          <DrawingToolbar
            activeTool={activeTool}
            onSelectTool={handleSelectTool}
          />
        )}

        <ChartGrid
          charts={charts}
          activeChartId={activeChartId}
          locked={locked}
          activeTool={activeTool}
          setActiveTool={setActiveTool}
          onActivate={setActiveChartId}
          onClose={closeChart}
          onUpdate={updateChart}
          onAddChart={() => setSymbolSearchMode('add')}
          scriptsById={customIndicators.scriptsById}
        />

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
            onAddIndicator={addIndicator}
            onClose={() => setShowIndicatorSearch(false)}
          />
        )}

        {showSymbolCatalog && (
          <SymbolCatalogModal
            onSelectSymbol={handleSelectSymbol}
            onOpenInNewChart={addChart}
            onClose={() => setShowSymbolCatalog(false)}
          />
        )}

        {symbolSearchMode && (
          <SymbolSearch
            onSelectSymbol={handleSelectSymbol}
            onOpenInNewChart={addChart}
            onClose={() => setSymbolSearchMode(null)}
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
    activeSession,
    createSession,
    renameSession,
    deleteSession,
    switchSession,
    saveLayout,
    loaded,
  } = useSessions(!!token);

  const [showWelcome, setShowWelcome] = useState(() => {
    const visited = localStorage.getItem(FIRST_VISIT_KEY);
    if (!visited) {
      localStorage.setItem(FIRST_VISIT_KEY, 'false');
      return true;
    }
    return false;
  });

  const customIndicators = useCustomIndicators(!!token);

  if (!token) {
    return <LoginScreen onLogin={login} />;
  }

  const sessionProps = {
    sessions,
    activeSession,
    onSwitchSession: switchSession,
    onCreateSession: () => {
      const name = window.prompt('Session name:');
      if (name?.trim()) createSession(name.trim());
    },
    onRenameSession: () => {
      if (!activeSession) return;
      const name = window.prompt('Rename session:', activeSession.name);
      if (name?.trim()) renameSession(activeSession.id, name.trim());
    },
    onDeleteSession: () => {
      if (activeSession && window.confirm(`Delete session "${activeSession.name}"?`)) {
        deleteSession(activeSession.id);
      }
    },
    username,
    onLogout: logout,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', overflow: 'hidden' }}>
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
        />
      ) : (
        <>
          <TopBar hasActiveChart={false} {...sessionProps} />
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
