"""Unit tests for mcp_server's pure helpers and per-session auth slots."""
import os
from unittest import TestCase, mock

from mcp_server import api
from mcp_server import server


class FakeContext:
    def __init__(self, headers=None):
        self.headers = headers


from contextlib import contextmanager


@contextmanager
def fresh_tokens():
    saved = dict(server._tokens)
    server._tokens.clear()
    try:
        yield server._tokens
    finally:
        server._tokens.clear()
        server._tokens.update(saved)


class ChartSymbolNameTests(TestCase):
    def test_dict_layout_and_legacy_string(self):
        self.assertEqual(server.chart_symbol_name({'symbol': {'symbol': 'PF_SOLUSD', 'provider': 'kraken_futures'}}),
                         'PF_SOLUSD')
        self.assertEqual(server.chart_symbol_name({'symbol': 'AAPL'}), 'AAPL')
        self.assertIsNone(server.chart_symbol_name({}))
        self.assertIsNone(server.chart_symbol_name({'symbol': {}}))


class GivenTests(TestCase):
    def test_keeps_falsy_values_but_drops_none(self):
        self.assertEqual(server.given(name='', shares=0, side=None, note='x'),
                         {'name': '', 'shares': 0, 'note': 'x'})


class LayoutSummaryTests(TestCase):
    def test_summarizes_dict_and_string_charts(self):
        summary = server.layout_summary(
            {'activeChartId': 'c1', 'locked': True, 'gridLayout': '2x2',
             'charts': [
                 {'symbol': {'symbol': 'PF_SOLUSD', 'provider': 'kraken_futures'}, 'interval': '1d', 'chartType': 'candle'},
                 {'symbol': 'AAPL', 'interval': '1h', 'chartType': 'line'},
             ]})
        self.assertEqual(summary, {
            'activeChartId': 'c1',
            'locked': True,
            'gridLayout': '2x2',
            'chartCount': 2,
            'charts': [
                {'symbol': 'PF_SOLUSD', 'provider': 'kraken_futures', 'interval': '1d', 'chartType': 'candle'},
                {'symbol': 'AAPL', 'provider': None, 'interval': '1h', 'chartType': 'line'},
            ]})

    def test_empty_layout(self):
        empty = server.layout_summary({})
        self.assertEqual(empty['chartCount'], 0)
        self.assertEqual(empty['charts'], [])


class WithLayoutSummaryTests(TestCase):
    def test_replaces_layout_with_summary(self):
        result = server.with_layout_summary({'id': 1, 'name': 'x', 'layout': {'charts': [{'symbol': 'AAPL'}]}})
        self.assertIn('layout_summary', result)
        self.assertNotIn('layout', result)


class SessionAuthTests(TestCase):
    def test_user_passes_context_instead_of_auth(self):
        self.assertEqual(server.mcp_session_id(None), server._DEFAULT_SLOT)
        self.assertEqual(server.mcp_session_id(FakeContext({})), server._DEFAULT_SLOT)
        self.assertEqual(server.mcp_session_id(FakeContext({'mcp-session-id': 'abc'})), 'abc')

    def test_remember_and_read_are_slot_scoped(self):
        with fresh_tokens() as tokens:
            tokens[server._DEFAULT_SLOT] = 'default-token'
            context = FakeContext({'mcp-session-id': 'abc'})
            with self.assertRaises(api.NotLoggedIn):
                server.session_token(context)

            server.remember_token(context, 'abc-token')
            self.assertEqual(server.session_token(context), 'abc-token')
            self.assertEqual(server.session_token(None), 'default-token')

    def test_session_token_without_login_raises(self):
        with fresh_tokens():
            with self.assertRaises(api.NotLoggedIn):
                server.session_token(None)

    def test_env_token_seeds_default_slot(self):
        import importlib
        try:
            with mock.patch.dict(os.environ, {'OPENTRADER_TOKEN': 'env-token'}):
                importlib.reload(server)
                self.assertEqual(server._tokens[server._DEFAULT_SLOT], 'env-token')
        finally:
            os.environ.pop('OPENTRADER_TOKEN', None)
            importlib.reload(server)
