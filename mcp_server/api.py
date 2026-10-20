"""Thin httpx wrapper over the OpenTrader REST API.

The API (market/views.py) is the source of truth: this module forwards the
DRF token and surfaces error messages, adding no business logic.
"""
import os

import httpx

base_url = os.environ.get('OPENTRADER_URL', 'http://localhost:8000').rstrip('/')
_token = os.environ.get('OPENTRADER_TOKEN') or None


class ApiError(Exception):
    def __init__(self, status_code, message):
        super().__init__(message)
        self.status_code = status_code
        self.message = message


class NotLoggedIn(ApiError):
    def __init__(self):
        super().__init__(401, 'Not logged in: call login(username) first')


def _error_message(response):
    for key in ('error', 'detail'):
        body = response.json() if response.headers.get('content-type', '').startswith('application/json') else {}
        if isinstance(body, dict) and body.get(key):
            return body[key]
    return response.text or f'HTTP {response.status_code}'


async def _request(method, path, json=None, params=None):
    global _token
    if not _token:
        raise NotLoggedIn()
    async with httpx.AsyncClient(base_url=base_url, timeout=30) as client:
        response = await client.request(
            method, path, json=json, params=params,
            headers={'Authorization': f'Token {_token}'},
        )
    if response.status_code >= 400:
        if response.status_code == 404:
            raise ApiError(404, f'Not found: {path}')
        raise ApiError(response.status_code, _error_message(response))
    if response.status_code == 204 or not response.content:
        return None
    return response.json()


async def login(username):
    global _token
    async with httpx.AsyncClient(base_url=base_url, timeout=30) as client:
        response = await client.post('/api/auth/login/', json={'username': username})
    if response.status_code >= 400:
        raise ApiError(response.status_code, _error_message(response))
    _token = response.json()['token']
    return {'username': response.json()['username']}


async def list_sessions():
    return await _request('GET', '/api/sessions/')


async def get_session(session_id):
    return await _request('GET', f'/api/sessions/{session_id}/')


async def create_session(name, layout=None, folder_id=None):
    body = {'name': name, 'layout': layout or {}}
    if folder_id is not None:
        body['folder'] = folder_id
    return await _request('POST', '/api/sessions/', json=body)


async def update_session(session_id, **fields):
    return await _request('PATCH', f'/api/sessions/{session_id}/', json=fields)


async def delete_session(session_id):
    return await _request('DELETE', f'/api/sessions/{session_id}/')


async def clone_session(session_id, name=None, new_symbol=None, from_symbol=None, folder_id=None):
    body = {}
    if name is not None:
        body['name'] = name
    if new_symbol is not None:
        body['new_symbol'] = new_symbol
    if from_symbol is not None:
        body['from_symbol'] = from_symbol
    if folder_id is not None:
        body['folder'] = folder_id
    return await _request('POST', f'/api/sessions/{session_id}/clone/', json=body)


async def list_folders():
    return await _request('GET', '/api/folders/')


async def create_folder(name):
    return await _request('POST', '/api/folders/', json={'name': name})


async def rename_folder(folder_id, name):
    return await _request('PATCH', f'/api/folders/{folder_id}/', json={'name': name})


async def delete_folder(folder_id):
    return await _request('DELETE', f'/api/folders/{folder_id}/')


async def get_preferences():
    return await _request('GET', '/api/preferences/')


async def update_preferences(**fields):
    return await _request('PATCH', '/api/preferences/', json=fields)


async def list_positions():
    return await _request('GET', '/api/positions/')


async def create_position(symbol, side, shares, price, opened_at=None, note=None):
    body = {'symbol': symbol, 'side': side, 'shares': shares, 'price': price}
    if opened_at is not None:
        body['opened_at'] = opened_at
    if note is not None:
        body['note'] = note
    return await _request('POST', '/api/positions/', json=body)


async def update_position(position_id, **fields):
    return await _request('PATCH', f'/api/positions/{position_id}/', json=fields)


async def delete_position(position_id):
    return await _request('DELETE', f'/api/positions/{position_id}/')


async def list_indicators():
    return await _request('GET', '/api/indicators/')


async def get_indicator(indicator_id):
    return await _request('GET', f'/api/indicators/{indicator_id}/')


async def create_indicator(name, code):
    return await _request('POST', '/api/indicators/', json={'name': name, 'code': code})


async def update_indicator(indicator_id, **fields):
    return await _request('PATCH', f'/api/indicators/{indicator_id}/', json=fields)


async def delete_indicator(indicator_id):
    return await _request('DELETE', f'/api/indicators/{indicator_id}/')
