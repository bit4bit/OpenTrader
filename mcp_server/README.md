# OpenTrader MCP server

Manages OpenTrader sessions, folders, positions and custom indicators by
forwarding to the Django REST API (`market/views.py`), exposed over MCP
**streamable HTTP**.

## Tools

`login`, `list_sessions`, `get_session`, `create_session`,
`update_session`, `delete_session`, `set_chart_description`,
`clone_session`, `list_folders`,
`create_folder`, `rename_folder`, `delete_folder`, `get_preferences`,
`update_preferences`, `list_positions`, `create_position`,
`update_position`, `delete_position`, `list_indicators`,
`get_indicator`, `create_indicator`, `update_indicator`,
`delete_indicator`

Session tools return a `layout_summary` (chart ids, symbols/intervals/
types and descriptions) instead of the full layout JSON;
`get_session(..., include_layout=True)` returns the raw layout.
Layout charts may carry an optional `description`, shown next to the
symbol in the chart title: set it in the seeded layout passed to
`create_session`, or edit existing charts with `set_chart_description`.

## Run

```bash
# local (backend on :8000)
pip install mcp httpx
python -m mcp_server.server          # serves /mcp on 0.0.0.0:8001
```

In Docker, `compose.yml` runs it as the `mcp` service (port 8001, on the
internal network); nginx proxies `http://<host>/mcp` to it.

## Auth

No passwords: call the `login` tool with a username once — the token is
remembered **per MCP connection**, so parallel clients each keep their own
account; every connection should call `login` first. Optionally set
`OPENTRADER_TOKEN` to share a default token with connections that skip
`login` (e.g. single-user setups), and `OPENTRADER_URL` to point at the API
(`http://backend:8000` inside Docker).

## Client configuration

Any MCP client speaking streamable HTTP:

```json
{
  "mcpServers": {
    "opentrader": { "url": "http://localhost:8001/mcp" }
  }
}
```

Through the docker nginx router: `"url": "http://<host>/mcp"`.
With `opencode`, add this to `opencode.json` under `"mcp"`; Claude Code
accepts the same shape (or `claude mcp add --transport http opentrader http://localhost:8001/mcp`).
