"""REST-API coverage for the session/folder/position/indicator surface,
including the session-clone semantics used by the MCP server."""
from unittest import mock

from market.providers import registry

from django.contrib.auth.models import User
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from market.models import Folder, Session


def chart(symbol, provider='yahoo', **extra):
    body = {'id': extra.pop('id', 'chart-1'), 'symbol': {'symbol': symbol, 'provider': provider}}
    body.update(extra)
    return body


class LoginTests(APITestCase):
    def test_login_creates_user_with_seed_session_and_token(self):
        response = self.client.post('/api/auth/login/', {'username': 'fresh'})
        self.assertEqual(response.status_code, 200)
        self.assertIn('token', response.data)
        token = Token.objects.get(user__username='fresh')
        self.assertEqual(response.data['token'], token.key)
        self.assertEqual(
            [s.name for s in Session.objects.filter(user__username='fresh')],
            ['My Session'],
        )

    def test_login_rejects_blank_username(self):
        self.assertEqual(self.client.post('/api/auth/login/', {}).status_code, 400)


def authenticated(username):
    client = APITestCase()
    user, _ = User.objects.get_or_create(username=username)
    token, _ = Token.objects.get_or_create(user=user)
    client.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')
    return client.client, user


class SessionCrudTests(APITestCase):
    def setUp(self):
        user, _ = User.objects.get_or_create(username='owner')
        token, _ = Token.objects.get_or_create(user=user)
        self.user = user
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

    def test_sessions_are_scoped_to_their_owner(self):
        Session.objects.create(user=User.objects.create_user('stranger'), name='not mine')
        Session.objects.create(user=self.user, name='mine')
        names = [s['name'] for s in self.client.get('/api/sessions/').json()]
        self.assertEqual(names, ['mine'])

    def test_create_requires_name(self):
        self.assertEqual(self.client.post('/api/sessions/', {}).status_code, 400)

    def test_create_with_layout_and_folder(self):
        folder = Folder.objects.create(user=self.user, name='f')
        response = self.client.post('/api/sessions/', {
            'name': 'Work', 'layout': {'charts': [chart('AAPL')]}, 'folder': folder.id,
        }, format='json')
        self.assertEqual(response.status_code, 201)
        session = Session.objects.get(name='Work')
        self.assertEqual(session.folder_id, folder.id)
        self.assertEqual(session.layout['charts'][0]['symbol']['symbol'], 'AAPL')

    def test_create_rejects_unknown_folder(self):
        response = self.client.post('/api/sessions/', {'name': 'x', 'folder': 999})
        self.assertEqual(response.status_code, 400)

    def test_patch_updates_only_given_fields(self):
        session = Session.objects.create(user=self.user, name='a', layout={'charts': [chart('AAPL')]}, notes='n')
        response = self.client.patch(
            f'/api/sessions/{session.id}/',
            {'favorite': True, 'notes': 'changed'},
            content_type='application/json',
        )
        data = response.json()
        self.assertEqual((data['favorite'], data['notes']), (True, 'changed'))
        session.refresh_from_db()
        self.assertEqual(session.name, 'a')
        self.assertTrue(session.favorite)

    def test_patch_moves_between_folders_and_back(self):
        session = Session.objects.create(user=self.user, name='a')
        folder = Folder.objects.create(user=self.user, name='f')
        self.client.patch(f'/api/sessions/{session.id}/', {'folder': folder.id}, content_type='application/json')
        session.refresh_from_db()
        self.assertEqual(session.folder_id, folder.id)
        self.client.patch(f'/api/sessions/{session.id}/', {'folder': None}, content_type='application/json')
        session.refresh_from_db()
        self.assertIsNone(session.folder)

    def test_delete_removes_session(self):
        session = Session.objects.create(user=self.user, name='a')
        self.assertEqual(self.client.delete(f'/api/sessions/{session.id}/').status_code, 204)
        self.assertFalse(Session.objects.filter(pk=session.id).exists())

    def test_other_users_sessions_are_untouchable(self):
        session = Session.objects.create(user=User.objects.create_user('stranger'), name='theirs')
        self.assertEqual(self.client.get(f'/api/sessions/{session.id}/').status_code, 404)


class SessionCloneTests(APITestCase):
    def setUp(self):
        user, _ = User.objects.get_or_create(username='owner')
        token, _ = Token.objects.get_or_create(user=user)
        self.user = user
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')
        self.folder = Folder.objects.create(user=self.user, name='f')
        self.source = Session.objects.create(
            user=self.user, name='PF_SOL', folder=self.folder, notes='keep me',
            layout={
                'charts': [
                    chart('PF_SOLUSD', 'kraken_futures', id='s1', interval='1d', drawings=[{'kind': 'line'}]),
                    chart('PF_SOLUSD', 'kraken_futures', id='s2', interval='30m'),
                ],
                'activeChartId': 's1',
            },
        )

    def clone(self, url=None, **body):
        return self.client.post(f'/api/sessions/{self.source.id}/clone/', body,
                                content_type='application/json')

    def test_default_clone_copies_everything_deeply(self):
        response = self.clone()
        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertEqual(data['name'], 'PF_SOL (copy)')
        self.assertEqual(data['folder'], self.folder.id)
        self.assertEqual(data['notes'], 'keep me')
        clone = Session.objects.get(pk=data['id'])
        self.assertEqual(clone.layout['charts'][0]['drawings'], [{'kind': 'line'}])
        self.assertEqual(clone.layout['activeChartId'], 's1')

        # deep copy: mutating the original layout must not leak into the clone
        self.source.layout['charts'][0]['drawings'].append({'kind': 'moved'})
        self.source.save()
        clone.refresh_from_db()
        self.assertEqual(clone.layout['charts'][0]['drawings'], [{'kind': 'line'}])

    def test_clone_repoints_uniform_source_with_resolved_provider(self):
        resolver = mock.patch(
            'market.providers.registry.resolve_provider',
            return_value=(object(), {'provider': 'kraken'}),
        )
        with resolver:
            response = self.clone(new_symbol='SOL/USD')
        data = response.json()
        clone = Session.objects.get(pk=data['id'])
        self.assertEqual(
            [c['symbol'] for c in clone.layout['charts']],
            [{'symbol': 'SOL/USD', 'provider': 'kraken'}] * 2,
        )
        self.assertEqual(clone.layout['charts'][0]['drawings'], [])

    def test_clone_repoints_only_matching_charts_and_keeps_other_drawings(self):
        self.source.layout['charts'] = [
            chart('PF_SOLUSD', 'kraken_futures', id='s1', drawings=[{'kind': 'line'}]),
            chart('PF_XBTUSD', 'kraken_futures', id='s2', drawings=[{'kind': 'keep'}]),
        ]
        self.source.save()
        resolver = mock.patch(
            'market.providers.registry.resolve_provider',
            return_value=(object(), {'provider': 'kraken'}),
        )
        with resolver:
            response = self.clone(new_symbol='SOL/USD', from_symbol='PF_SOLUSD')
        clone = Session.objects.get(pk=response.json()['id'])
        self.assertEqual(clone.layout['charts'][0]['symbol']['symbol'], 'SOL/USD')
        self.assertEqual(clone.layout['charts'][1]['symbol']['symbol'], 'PF_XBTUSD')
        self.assertEqual(clone.layout['charts'][0]['drawings'], [])
        self.assertEqual(clone.layout['charts'][1]['drawings'], [{'kind': 'keep'}])

    def test_clone_on_mixed_source_requires_from_symbol(self):
        self.source.layout['charts'] = [
            chart('PF_SOLUSD', 'kraken_futures', id='s1'),
            chart('PF_XBTUSD', 'kraken_futures', id='s2'),
        ]
        self.source.save()
        response = self.clone(new_symbol='SOL/USD')
        self.assertEqual(response.status_code, 400)
        self.assertIn('multiple symbols', response.json()['error'])
        self.assertIn('PF_XBTUSD', response.json()['error'])
        self.assertFalse(Session.objects.filter(name='PF_SOL (copy)').exists())

    def test_clone_rejects_unresolvable_symbol(self):
        resolver = mock.patch(
            'market.providers.registry.resolve_provider',
            side_effect=registry.SymbolNotSupported('nope'),
        )
        with resolver:
            response = self.clone(new_symbol='ZZZZ')
        self.assertEqual(response.status_code, 400)
        self.assertIn('Cannot resolve symbol ZZZZ', response.json()['error'])

    def test_clone_overrides_folder(self):
        target = Folder.objects.create(user=self.user, name='other')
        response = self.clone(folder=target.id)
        self.assertEqual(response.json()['folder'], target.id)

    def test_source_must_be_owned(self):
        user2 = User.objects.create_user('stranger')
        Session.objects.create(user=user2, name='s')
        response = self.client.post(f'/api/sessions/{Session.objects.get(user=user2).id}/clone/',
                                    {}, content_type='application/json')
        self.assertEqual(response.status_code, 404)


class FolderTests(APITestCase):
    def setUp(self):
        user, _ = User.objects.get_or_create(username='owner')
        token, _ = Token.objects.get_or_create(user=user)
        self.user = user
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

    def test_crud(self):
        response = self.client.post('/api/folders/', {'name': 'crypto'})
        folder_id = response.json()['id']
        self.assertEqual(response.status_code, 201)

        renamed = self.client.patch(f'/api/folders/{folder_id}/', {'name': 'kraken'},
                                    content_type='application/json')
        self.assertEqual(renamed.json()['name'], 'kraken')

        # deleting a folder keeps its sessions, only ungrouped
        session = Session.objects.create(user=self.user, name='s')
        self.client.patch(f'/api/sessions/{session.id}/', {'folder': folder_id},
                          content_type='application/json')
        self.assertEqual(self.client.delete(f'/api/folders/{folder_id}/').status_code, 204)
        session.refresh_from_db()
        self.assertIsNone(session.folder)

    def test_folder_names_must_be_unique_resolveable(self):
        self.assertEqual(self.client.post('/api/folders/', {}).status_code, 400)


class PreferenceTests(APITestCase):
    def setUp(self):
        user, _ = User.objects.get_or_create(username='owner')
        token, _ = Token.objects.get_or_create(user=user)
        self.user = user
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

    def test_get_or_create_and_patch(self):
        data = self.client.get('/api/preferences/').json()
        self.assertEqual(data, {'active_folder': None, 'note': ''})

        folder = Folder.objects.create(user=self.user, name='f')
        patched = self.client.patch('/api/preferences/', {'active_folder': folder.id, 'note': 'hey'},
                                    content_type='application/json').json()
        self.assertEqual(patched['active_folder'], folder.id)
        self.assertEqual(patched['note'], 'hey')

        cleared = self.client.patch('/api/preferences/', {'active_folder': None},
                                    content_type='application/json').json()
        self.assertIsNone(cleared['active_folder'])

    def test_invalid_folder_rejected(self):
        response = self.client.patch('/api/preferences/', {'active_folder': 999},
                                     content_type='application/json')
        self.assertEqual(response.status_code, 400)


class PositionTests(APITestCase):
    def setUp(self):
        user, _ = User.objects.get_or_create(username='owner')
        token, _ = Token.objects.get_or_create(user=user)
        self.user = user
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

    def test_create_requires_symbol_and_numbers(self):
        self.assertEqual(self.client.post('/api/positions/', {'shares': 1, 'price': 2}).status_code, 400)
        self.assertEqual(
            self.client.post('/api/positions/', {'symbol': 'AAPL', 'shares': 'x', 'price': 1}).status_code,
            400,
        )

    def test_create_defaults_and_ipc618(self):
        data = self.client.post('/api/positions/', {
            'symbol': 'AAPL', 'shares': 10, 'price': 190.5,
            'opened_at': '2026-01-15T10:30:00Z', 'side': 'nonsense', 'note': 'n',
        }).json()
        self.assertEqual(data['side'], 'buy')
        self.assertEqual(data['opened_at'], '2026-01-15T10:30:00+00:00')

    def test_update_and_clear_opened_at(self):
        position_id = self.client.post('/api/positions/', {
            'symbol': 'AAPL', 'shares': 10, 'price': 190.5, 'opened_at': '2026-01-15T10:30:00Z',
        }).json()['id']
        data = self.client.patch(f'/api/positions/{position_id}/', {'side': 'sell', 'shares': 12},
                                 content_type='application/json').json()
        self.assertEqual((data['side'], data['shares']), ('sell', 12.0))
        self.assertEqual(data['opened_at'], '2026-01-15T10:30:00+00:00')
        cleared = self.client.patch(f'/api/positions/{position_id}/', {'opened_at': None},
                                    content_type='application/json').json()
        self.assertIsNone(cleared['opened_at'])

    def test_delete_and_ownership(self):
        mine = self.client.post('/api/positions/', {'symbol': 'AAPL', 'shares': 1, 'price': 1}).json()['id']
        self.assertEqual(self.client.delete(f'/api/positions/{mine}/').status_code, 204)


class IndicatorTests(APITestCase):
    def setUp(self):
        user, _ = User.objects.get_or_create(username='owner')
        token, _ = Token.objects.get_or_create(user=user)
        self.user = user
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

    def test_crud(self):
        data = self.client.post('/api/indicators/', {'name': 'e1', 'code': 'plot(close)'}).json()
        self.assertEqual(data['code'], 'plot(close)')

        patched = self.client.patch(f"/api/indicators/{data['id']}/", {'code': 'plot(open)'},
                                    content_type='application/json').json()
        self.assertEqual(patched['code'], 'plot(open)')

        self.assertEqual(self.client.delete(f"/api/indicators/{data['id']}/").status_code, 204)

    def test_owner_scoped(self):
        stranger = User.objects.create_user('stranger')
        token, _ = Token.objects.get_or_create(user=stranger)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')
        data = self.client.post('/api/indicators/', {'name': 'x', 'code': ''}).json()
        self.client.credentials(HTTP_AUTHORIZATION='')
        other = User.objects.create_user('victim')
        token2, _ = Token.objects.get_or_create(user=other)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token2.key}')
        self.assertEqual(self.client.get(f"/api/indicators/{data['id']}/").status_code, 404)
