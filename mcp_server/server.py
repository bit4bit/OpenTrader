"""OpenTrader MCP server: session/folder/position/indicator management
over the OpenTrader REST API, exposed via streamable HTTP.

Run: python -m mcp_server.server  (env: OPENTRADER_URL, OPENTRADER_TOKEN,
MCP_HOST, MCP_PORT)

Auth is per MCP session: each client connection calls login(username)
once and the token is remembered for that connection only, so parallel
clients stay on their own accounts. OPENTRADER_TOKEN marks the shared
default slot (connections without a session id, e.g. stdio), not every
connection.
"""
import functools
import os
from typing import Any

from mcp.server.mcpserver import MCPServer
from mcp.server.mcpserver.context import Context
from mcp.server.mcpserver.exceptions import ToolError

from . import api

mcp = MCPServer('opentrader')

_DEFAULT_SLOT = None
_tokens = {_DEFAULT_SLOT: os.environ.get('OPENTRADER_TOKEN') or None}


def mcp_session_id(ctx):
    """MCP connection id from the carrying request's headers; None assigns
    the connection to the default slot."""
    if ctx is None:
        return _DEFAULT_SLOT
    headers = ctx.headers or {}
    for name in ('mcp-session-id', 'Mcp-Session-Id', 'MCP-SESSION-ID'):
        if headers.get(name):
            return headers[name]
    return _DEFAULT_SLOT


def session_token(ctx=None):
    token = _tokens.get(mcp_session_id(ctx))
    if not token:
        raise api.NotLoggedIn()
    return token


def remember_token(ctx, token):
    _tokens[mcp_session_id(ctx)] = token


def api_tool(func):
    """Surface REST API failures as readable tool errors instead of
    SDK-crash messages."""
    @functools.wraps(func)
    async def wrapper(*args, **kwargs):
        try:
            return await func(*args, **kwargs)
        except api.ApiError as error:
            raise ToolError(error.message) from error
    return wrapper


def layout_summary(layout):
    charts = layout.get('charts') or []
    return {
        'activeChartId': layout.get('activeChartId'),
        'locked': layout.get('locked'),
        'gridLayout': layout.get('gridLayout'),
        'chartCount': len(charts),
        'charts': [
            {
                'id': c.get('id'),
                'symbol': chart_symbol_name(c),
                'provider': (c.get('symbol') or {}).get('provider') if isinstance(c.get('symbol'), dict) else None,
                'interval': c.get('interval'),
                'chartType': c.get('chartType'),
                'description': c.get('description') or '',
            }
            for c in charts
        ],
    }


def chart_symbol_name(chart):
    """Chart symbol is a {symbol, provider} dict in current layouts, a
    plain string in older ones."""
    field = chart.get('symbol')
    return field.get('symbol') if isinstance(field, dict) else field


def with_layout_summary(session):
    result = {key: value for key, value in session.items() if key != 'layout'}
    result['layout_summary'] = layout_summary(session.get('layout') or {})
    return result


def given(**fields):
    return {key: value for key, value in fields.items() if value is not None}


def charts_matching(charts, chart_id=None, symbol=None, interval=None):
    """Charts whose stored fields match every given filter; None filters
    are skipped, so callers choosing symbols for description edits get an
    unambiguous selection."""
    filters = given(chart_id=chart_id, symbol=symbol, interval=interval)
    if not filters:
        raise ToolError('Select charts to edit: pass chart_id, symbol or interval')
    return [
        chart for chart in charts
        if ('chart_id' not in filters or chart.get('id') == chart_id)
        and ('symbol' not in filters or chart_symbol_name(chart) == symbol)
        and ('interval' not in filters or chart.get('interval') == interval)
    ]


@mcp.tool()
@api_tool
async def login(username: str, ctx: Context = None) -> dict:
    """Log in to OpenTrader with a username (no password). The token is
    remembered for this connection only; each parallel client connection
    has its own login (OPENTRADER_TOKEN provides a shared default)."""
    result = await api.login(username)
    remember_token(ctx, result['token'])
    return {'username': result['username']}


@mcp.tool()
@api_tool
async def list_sessions(ctx: Context = None) -> list[dict]:
    """List all chart sessions of the logged-in user, with a per-chart
    summary (symbol/interval/type) instead of the full layout JSON."""
    return [with_layout_summary(s) for s in await api.list_sessions(session_token(ctx))]


@mcp.tool()
@api_tool
async def get_session(session_id: int, include_layout: bool = False,
                      ctx: Context = None) -> dict:
    """Get one session. Returns a layout summary unless include_layout
    asks for the full layout JSON (charts, drawings, indicators)."""
    session = await api.get_session(session_token(ctx), session_id)
    if not include_layout:
        return with_layout_summary(session)
    return session


@mcp.tool()
@api_tool
async def create_session(
    name: str, layout: dict | None = None, folder_id: int | None = None,
    ctx: Context = None,
) -> dict:
    """Create a chart session, optionally seeding it with a layout JSON
    and placing it in a folder. Layout charts may include an optional
    `description` shown next to the symbol in the chart title."""
    session = await api.create_session(
        session_token(ctx), name, layout, folder_id)
    return with_layout_summary(session)


@mcp.tool()
@api_tool
async def update_session(
    session_id: int,
    name: str | None = None,
    layout: dict[str, Any] | None = None,
    notes: str | None = None,
    favorite: bool | None = None,
    portfolio: bool | None = None,
    folder_id: int | None = None,
    clear_folder: bool = False,
    ctx: Context = None,
) -> dict:
    """Update a session: rename, replace layout JSON, set notes,
    toggle favorite/portfolio flags, move it into folder_id, or remove
    it from its folder with clear_folder."""
    fields = given(
        name=name, layout=layout, notes=notes, favorite=favorite,
        portfolio=portfolio,
    )
    if clear_folder:
        fields['folder'] = None
    elif folder_id is not None:
        fields['folder'] = folder_id
    return await api.update_session(session_token(ctx), session_id, **fields)


@mcp.tool()
@api_tool
async def delete_session(session_id: int, ctx: Context = None) -> None:
    """Delete a chart session (its layout is lost)."""
    await api.delete_session(session_token(ctx), session_id)


@mcp.tool()
@api_tool
async def set_chart_description(
    session_id: int,
    description: str,
    chart_id: str | None = None,
    symbol: str | None = None,
    interval: str | None = None,
    ctx: Context = None,
) -> dict:
    """Set the description shown next to the symbol in a chart's title.
    Selects charts from the session's layout by chart_id, symbol and/or
    interval (AND-combined, at least one required) and writes the same
    description to every match; pass "" to clear it."""
    session = await api.get_session(session_token(ctx), session_id,
                                    include_layout=True)
    layout = session.get('layout') or {}
    charts = layout.get('charts') or []
    matched = charts_matching(charts, chart_id, symbol, interval)
    matched_ids = {id(chart) for chart in matched}
    updated_charts = [
        {**chart, 'description': description} if id(chart) in matched_ids else chart
        for chart in charts
    ]
    await api.update_session(
        session_token(ctx), session_id,
        layout={**layout, 'charts': updated_charts})
    return {'updated': len(matched), **layout_summary({**layout, 'charts': updated_charts})}


@mcp.tool()
@api_tool
async def clone_session(
    session_id: int,
    name: str | None = None,
    new_symbol: str | None = None,
    from_symbol: str | None = None,
    folder_id: int | None = None,
    ctx: Context = None,
) -> dict:
    """Create a new session copying another session's layout (charts,
    intervals, indicators, drawings, notes). With `new_symbol`, cloned
    charts are re-pointed at that symbol and their drawings are dropped.
    If the source has charts with different symbols, `from_symbol` is
    required to select which to replace; with a single-symbol source,
    new_symbol alone is enough. Defaults: name '<original> (copy)',
    same folder, everything copied as-is."""
    session = await api.clone_session(
        session_token(ctx), session_id, name, new_symbol, from_symbol, folder_id)
    return with_layout_summary(session)


@mcp.tool()
@api_tool
async def list_folders(ctx: Context = None) -> list[dict]:
    """List the user's session folders."""
    return await api.list_folders(session_token(ctx))


@mcp.tool()
@api_tool
async def create_folder(name: str, ctx: Context = None) -> dict:
    """Create a folder to group sessions in."""
    return await api.create_folder(session_token(ctx), name)


@mcp.tool()
@api_tool
async def rename_folder(folder_id: int, name: str, ctx: Context = None) -> dict:
    """Rename a folder."""
    return await api.rename_folder(session_token(ctx), folder_id, name)


@mcp.tool()
@api_tool
async def delete_folder(folder_id: int, ctx: Context = None) -> None:
    """Delete a folder; its sessions survive and become ungrouped."""
    await api.delete_folder(session_token(ctx), folder_id)


@mcp.tool()
@api_tool
async def get_preferences(ctx: Context = None) -> dict:
    """Get the user's preferences (active folder, note)."""
    return await api.get_preferences(session_token(ctx))


@mcp.tool()
@api_tool
async def update_preferences(
    active_folder_id: int | None = None,
    clear_active_folder: bool = False,
    note: str | None = None,
    ctx: Context = None,
) -> dict:
    """Set preferences: the folder the UI opens on, or a free-form note."""
    fields = given(note=note)
    if clear_active_folder:
        fields['active_folder'] = None
    elif active_folder_id is not None:
        fields['active_folder'] = active_folder_id
    return await api.update_preferences(session_token(ctx), **fields)


@mcp.tool()
@api_tool
async def list_positions(ctx: Context = None) -> list[dict]:
    """List the user's tracked positions (symbol, side, shares, price,
    opened date, note)."""
    return await api.list_positions(session_token(ctx))


@mcp.tool()
@api_tool
async def create_position(
    symbol: str,
    shares: float,
    price: float,
    side: str = 'buy',
    opened_at: str | None = None,
    note: str | None = None,
    ctx: Context = None,
) -> dict:
    """Track a position on a symbol: side is 'buy' or 'sell', shares and
    price are numbers, opened_at is an ISO datetime (optional), plus an
    optional note."""
    return await api.create_position(
        session_token(ctx), symbol, side, shares, price, opened_at, note)


@mcp.tool()
@api_tool
async def update_position(
    position_id: int,
    side: str | None = None,
    shares: float | None = None,
    price: float | None = None,
    opened_at: str | None = None,
    clear_opened_at: bool = False,
    note: str | None = None,
    ctx: Context = None,
) -> dict:
    """Update a tracked position: side ('buy'/'sell'), shares, price,
    note; set opened_at to an ISO datetime or remove it with
    clear_opened_at."""
    fields = given(side=side, shares=shares, price=price, note=note)
    if clear_opened_at:
        fields['opened_at'] = None
    elif opened_at is not None:
        fields['opened_at'] = opened_at
    return await api.update_position(session_token(ctx), position_id, **fields)


@mcp.tool()
@api_tool
async def delete_position(position_id: int, ctx: Context = None) -> None:
    """Delete a tracked position."""
    await api.delete_position(session_token(ctx), position_id)


@mcp.tool()
@api_tool
async def list_indicators(ctx: Context = None) -> list[dict]:
    """List the user's custom indicators (name, code)."""
    return await api.list_indicators(session_token(ctx))


@mcp.tool()
@api_tool
async def get_indicator(indicator_id: int, ctx: Context = None) -> dict:
    """Get one custom indicator's source code."""
    return await api.get_indicator(session_token(ctx), indicator_id)


@mcp.tool()
@api_tool
async def create_indicator(name: str, code: str, ctx: Context = None) -> dict:
    """Create a custom indicator from its source code."""
    return await api.create_indicator(session_token(ctx), name, code)


@mcp.tool()
@api_tool
async def update_indicator(
    indicator_id: int, name: str | None = None, code: str | None = None,
    ctx: Context = None,
) -> dict:
    """Rename or replace the source code of a custom indicator."""
    return await api.update_indicator(
        session_token(ctx), indicator_id, **given(name=name, code=code))


@mcp.tool()
@api_tool
async def delete_indicator(indicator_id: int, ctx: Context = None) -> None:
    """Delete a custom indicator."""
    await api.delete_indicator(session_token(ctx), indicator_id)


@mcp.tool()
@api_tool
async def measure_trendline(
    symbol: str,
    interval: str,
    start: int,
    end: int,
    anchor: str = 'close',
    provider: str | None = None,
    ctx: Context = None,
) -> dict:
    """Measure an imaginary trend line between two candles of a chart.
    symbol and interval ('1m', '5m', '15m', '30m', '1h', '4h', '1d', '5d',
    '1wk', '1mo', '3mo') select the chart; start and end are epoch-second
    timestamps, snapped to the candle containing them (so any timestamp
    inside a trading day works for daily charts). Bars come from the same
    cached history the UI charts use, not a fresh provider fetch. anchor
    picks the endpoint price rule: 'close' (default), 'open', 'high' or
    'low' — use 'low'/'high' for support/resistance lines. Returns the
    candle count between the anchors, their times and prices, slope per
    bar, change and change percent (total and per bar), angle in degrees
    under the convention that one bar and one price unit are each one
    axis unit (not a chart-zoom truth), and the average volume of the
    stretch."""
    return await api.trendline(
        session_token(ctx), symbol, interval, start, end, anchor, provider)


@mcp.tool()
@api_tool
async def find_candle_crossings(
    symbol: str,
    interval: str,
    start: int,
    end: int,
    price: float,
    provider: str | None = None,
    ctx: Context = None,
) -> dict:
    """Find the candles that cross a horizontal price line drawn on a
    chart. symbol and interval ('1m', '5m', '15m', '30m', '1h', '4h',
    '1d', '5d', '1wk', '1mo', '3mo') select the chart; start and end are
    epoch-second timestamps snapped to the candle containing them, price
    is the horizontal line's level. Bars come from the same cached
    history the UI charts use, not a fresh provider fetch. A candle
    crosses when the line lies inside its span (low <= price <= high,
    wick touches included). Returns the crossing candles with their
    OHLCV, the count, the average volume over them, and the anchor
    candle times of the measured window (possibly wider than the
    crossings)."""
    return await api.candle_crossings(
        session_token(ctx), symbol, interval, price, start, end, provider)


if __name__ == '__main__':
    mcp.run(
        transport='streamable-http',
        host=os.environ.get('MCP_HOST', '0.0.0.0'),
        port=int(os.environ.get('MCP_PORT', '8001')),
    )
