"""OpenTrader MCP server: session/folder/position/indicator management
over the OpenTrader REST API, exposed via streamable HTTP.

Run: python -m mcp_server.server  (env: OPENTRADER_URL, OPENTRADER_TOKEN,
MCP_HOST, MCP_PORT)
"""
import functools
import os
from typing import Any

from mcp.server.mcpserver import MCPServer
from mcp.server.mcpserver.exceptions import ToolError

from . import api

mcp = MCPServer('opentrader')


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


def chart_symbol_name(chart):
    """Chart symbol is a {symbol, provider} dict in current layouts, a
    plain string in older ones."""
    field = chart.get('symbol')
    return field.get('symbol') if isinstance(field, dict) else field


def layout_summary(layout):
    charts = layout.get('charts') or []
    return {
        'activeChartId': layout.get('activeChartId'),
        'locked': layout.get('locked'),
        'gridLayout': layout.get('gridLayout'),
        'chartCount': len(charts),
        'charts': [
            {
                'symbol': chart_symbol_name(c),
                'provider': (c.get('symbol') or {}).get('provider') if isinstance(c.get('symbol'), dict) else None,
                'interval': c.get('interval'),
                'chartType': c.get('chartType'),
            }
            for c in charts
        ],
    }


def with_layout_summary(session):
    result = {key: value for key, value in session.items() if key != 'layout'}
    result['layout_summary'] = layout_summary(session.get('layout') or {})
    return result


def given(**fields):
    return {key: value for key, value in fields.items() if value is not None}


@mcp.tool()
@api_tool
async def login(username: str) -> dict:
    """Log in to OpenTrader with a username (no password) and cache the
    token for all subsequent tool calls."""
    return await api.login(username)


@mcp.tool()
@api_tool
async def list_sessions() -> list[dict]:
    """List all chart sessions of the logged-in user, with a per-chart
    summary (symbol/interval/type) instead of the full layout JSON."""
    return [with_layout_summary(s) for s in await api.list_sessions()]


@mcp.tool()
@api_tool
async def get_session(session_id: int, include_layout: bool = False) -> dict:
    """Get one session. Returns a layout summary unless include_layout
    asks for the full layout JSON (charts, drawings, indicators)."""
    session = await api.get_session(session_id)
    if not include_layout:
        return with_layout_summary(session)
    return session


@mcp.tool()
@api_tool
async def create_session(
    name: str, layout: dict | None = None, folder_id: int | None = None
) -> dict:
    """Create a chart session, optionally seeding it with a layout JSON
    and placing it in a folder."""
    session = await api.create_session(name, layout, folder_id)
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
    return await api.update_session(session_id, **fields)


@mcp.tool()
@api_tool
async def delete_session(session_id: int) -> None:
    """Delete a chart session (its layout is lost)."""
    await api.delete_session(session_id)


@mcp.tool()
@api_tool
async def clone_session(
    session_id: int,
    name: str | None = None,
    new_symbol: str | None = None,
    from_symbol: str | None = None,
    folder_id: int | None = None,
) -> dict:
    """Create a new session copying another session's layout (charts,
    intervals, indicators, drawings, notes). With `new_symbol`, cloned
    charts are re-pointed at that symbol and their drawings are dropped.
    If the source has charts with different symbols, `from_symbol` is
    required to select which to replace; with a single-symbol source,
    new_symbol alone is enough. Defaults: name '<original> (copy)',
    same folder, everything copied as-is."""
    session = await api.clone_session(session_id, name, new_symbol, from_symbol, folder_id)
    return with_layout_summary(session)


@mcp.tool()
@api_tool
async def list_folders() -> list[dict]:
    """List the user's session folders."""
    return await api.list_folders()


@mcp.tool()
@api_tool
async def create_folder(name: str) -> dict:
    """Create a folder to group sessions in."""
    return await api.create_folder(name)


@mcp.tool()
@api_tool
async def rename_folder(folder_id: int, name: str) -> dict:
    """Rename a folder."""
    return await api.rename_folder(folder_id, name)


@mcp.tool()
@api_tool
async def delete_folder(folder_id: int) -> None:
    """Delete a folder; its sessions survive and become ungrouped."""
    await api.delete_folder(folder_id)


@mcp.tool()
@api_tool
async def get_preferences() -> dict:
    """Get the user's preferences (active folder, note)."""
    return await api.get_preferences()


@mcp.tool()
@api_tool
async def update_preferences(
    active_folder_id: int | None = None,
    clear_active_folder: bool = False,
    note: str | None = None,
) -> dict:
    """Set preferences: the folder the UI opens on, or a free-form note."""
    fields = given(note=note)
    if clear_active_folder:
        fields['active_folder'] = None
    elif active_folder_id is not None:
        fields['active_folder'] = active_folder_id
    return await api.update_preferences(**fields)


@mcp.tool()
@api_tool
async def list_positions() -> list[dict]:
    """List the user's tracked positions (symbol, side, shares, price,
    opened date, note)."""
    return await api.list_positions()


@mcp.tool()
@api_tool
async def create_position(
    symbol: str,
    shares: float,
    price: float,
    side: str = 'buy',
    opened_at: str | None = None,
    note: str | None = None,
) -> dict:
    """Track a position on a symbol: side is 'buy' or 'sell', shares and
    price are numbers, opened_at is an ISO datetime (optional), plus an
    optional note."""
    return await api.create_position(symbol, side, shares, price, opened_at, note)


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
) -> dict:
    """Update a tracked position: side ('buy'/'sell'), shares, price,
    note; set opened_at to an ISO datetime or remove it with
    clear_opened_at."""
    fields = given(side=side, shares=shares, price=price, note=note)
    if clear_opened_at:
        fields['opened_at'] = None
    elif opened_at is not None:
        fields['opened_at'] = opened_at
    return await api.update_position(position_id, **fields)


@mcp.tool()
@api_tool
async def delete_position(position_id: int) -> None:
    """Delete a tracked position."""
    await api.delete_position(position_id)


@mcp.tool()
@api_tool
async def list_indicators() -> list[dict]:
    """List the user's custom indicators (name, code)."""
    return await api.list_indicators()


@mcp.tool()
@api_tool
async def get_indicator(indicator_id: int) -> dict:
    """Get one custom indicator's source code."""
    return await api.get_indicator(indicator_id)


@mcp.tool()
@api_tool
async def create_indicator(name: str, code: str) -> dict:
    """Create a custom indicator from its source code."""
    return await api.create_indicator(name, code)


@mcp.tool()
@api_tool
async def update_indicator(
    indicator_id: int, name: str | None = None, code: str | None = None
) -> dict:
    """Rename or replace the source code of a custom indicator."""
    return await api.update_indicator(
        indicator_id, **given(name=name, code=code)
    )


@mcp.tool()
@api_tool
async def delete_indicator(indicator_id: int) -> None:
    """Delete a custom indicator."""
    await api.delete_indicator(indicator_id)


if __name__ == '__main__':
    mcp.run(
        transport='streamable-http',
        host=os.environ.get('MCP_HOST', '0.0.0.0'),
        port=int(os.environ.get('MCP_PORT', '8001')),
    )
