"""Thin httpx wrapper over the OpenTrader REST API.

The API (market/views.py) is the source of truth: this module forwards the
DRF token it is given and surfaces error messages, adding no business logic.
Token storage lives in server.py (per MCP session).
"""
import os

import httpx

base_url = os.environ.get('OPENTRADER_URL', 'http://localhost:8000').rstrip('')


class ApiError(Exception):
    def __init__(self, status_code, message):
        super().__init__(message)
        self.status_code = status_code
        self.message = message


class NotLoggedIn(ApiError):
    def __init__(self):
        super().__init__(401, 'Not logged in: call login(username) first')


def _error_message(response):
    body = {}
    if response.headers.get('content-type', '').startswith('application/json'):
        body = response.json()
    for key in ('error', 'detail'):
        if isinstance(body, dict) and body.get(key):
            return body[key]
    return response.text or f'HTTP {response.status_code}'


async def request(method, path, token, json=None, params=None):
    if not token:
        raise NotLoggedIn()
    async with httpx.AsyncClient(base_url=base_url, timeout=30) as client:
        response = await client.request(
            method, path, json=json, params=params,
            headers={'Authorization': f'Token {token}'},
        )
    if response.status_code >= 400:
        if response.status_code == 404:
            raise ApiError(404, f'Not found: {path}')
        raise ApiError(response.status_code, _error_message(response))
    if response.status_code == 204 or not response.content:
        return None
    return response.json()


async def login(username):
    """Passwordless username login; returns the API's {token, username}
    payload. No token needed: the API creates users on first login."""
    async with httpx.AsyncClient(base_url=base_url, timeout=30) as client:
        response = await client.post('/api/auth/login/', json={'username': username})
    if response.status_code >= 400:
        raise ApiError(response.status_code, _error_message(response))
    return response.json()


async def list_sessions(token):
    return await request('GET', '/api/sessions/', token)


async def get_session(token, session_id):
    return await request('GET', f'/api/sessions/{session_id}/', token)


async def create_session(token, name, layout=None, folder_id=None):
    body = {'name': name, 'layout': layout or {}}
    if folder_id is not None:
        body['folder'] = folder_id
    return await request('POST', '/api/sessions/', token, json=body)


async def update_session(token, session_id, **fields):
    return await request('PATCH', f'/api/sessions/{session_id}/', token, json=fields)


async def delete_session(token, session_id):
    return await request('DELETE', f'/api/sessions/{session_id}/', token)


async def clone_session(token, session_id, name=None, new_symbol=None,
                        from_symbol=None, folder_id=None):
    body = {}
    if name is not None:
        body['name'] = name
    if new_symbol is not None:
        body['new_symbol'] = new_symbol
    if from_symbol is not None:
        body['from_symbol'] = from_symbol
    if folder_id is not None:
        body['folder'] = folder_id
    return await request('POST', f'/api/sessions/{session_id}/clone/', token, json=body)


async def list_folders(token):
    return await request('GET', '/api/folders/', token)


async def create_folder(token, name):
    return await request('POST', '/api/folders/', token, json={'name': name})


async def rename_folder(token, folder_id, name):
    return await request('PATCH', f'/api/folders/{folder_id}/', token, json={'name': name})


async def delete_folder(token, folder_id):
    return await request('DELETE', f'/api/folders/{folder_id}/', token)


async def get_preferences(token):
    return await request('GET', '/api/preferences/', token)


async def update_preferences(token, **fields):
    return await request('PATCH', '/api/preferences/', token, json=fields)


async def list_positions(token):
    return await request('GET', '/api/positions/', token)


async def create_position(token, symbol, side, shares, price,
                          opened_at=None, note=None):
    body = {'symbol': symbol, 'side': side, 'shares': shares, 'price': price}
    if opened_at is not None:
        body['opened_at'] = opened_at
    if note is not None:
        body['note'] = note
    return await request('POST', '/api/positions/', token, json=body)


async def update_position(token, position_id, **fields):
    return await request('PATCH', f'/api/positions/{position_id}/', token, json=fields)


async def delete_position(token, position_id):
    return await request('DELETE', f'/api/positions/{position_id}/', token)


async def list_indicators(token):
    return await request('GET', '/api/indicators/', token)


async def get_indicator(token, indicator_id):
    return await request('GET', f'/api/indicators/{indicator_id}/', token)


async def create_indicator(token, name, code):
    return await request('POST', '/api/indicators/', token,
                         json={'name': name, 'code': code})


async def update_indicator(token, indicator_id, **fields):
    return await request('PATCH', f'/api/indicators/{indicator_id}/',
                         token, json=fields)


async def delete_indicator(token, indicator_id):
    return await request('DELETE', f'/api/indicators/{indicator_id}/', token)


async def trendline(token, symbol, interval, start, end, anchor='close', provider=None):
    params = {'symbol': symbol, 'interval': interval, 'start': start,
              'end': end, 'anchor': anchor}
    if provider is not None:
        params['provider'] = provider
    return await request('GET', '/api/trendline/', token, params=params)


async def candle_crossings(token, symbol, interval, price, start, end, provider=None):
    params = {'symbol': symbol, 'interval': interval, 'price': price,
              'start': start, 'end': end}
    if provider is not None:
        params['provider'] = provider
    return await request('GET', '/api/line-crosses/', token, params=params)


async def sma(token, symbol, interval, period, start, end, source='close', provider=None):
    params = {'symbol': symbol, 'interval': interval, 'period': period,
              'start': start, 'end': end, 'source': source}
    if provider is not None:
        params['provider'] = provider
    return await request('GET', '/api/sma/', token, params=params)