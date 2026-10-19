"""Tests for the tracked-position endpoints.

Scenarios: authentication, CRUD, validation, and owner isolation through
the real REST stack (token auth + database).
"""
from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.authtoken.models import Token


class PositionApiTests(TestCase):
    def setUp(self):
        self.user = User.objects.create(username='alice')
        self.other = User.objects.create(username='bob')
        self.client.defaults['HTTP_AUTHORIZATION'] = f'Token {Token.objects.create(user=self.user).key}'

    def create_position(self, symbol='AAPL', shares=100, price=150.25, opened_at=None, note='', side=None):
        payload = {'symbol': symbol, 'shares': shares, 'price': price, 'note': note}
        if side is not None:
            payload['side'] = side
        if opened_at is not None:
            payload['opened_at'] = opened_at
        return self.client.post('/api/positions/', payload, content_type='application/json')

    def test_requires_authentication(self):
        self.client.defaults.pop('HTTP_AUTHORIZATION')
        response = self.client.get('/api/positions/')
        self.assertEqual(response.status_code, 401)

    def test_create_and_list(self):
        response = self.create_position(opened_at='2026-01-02T14:30:00Z', note='breakout retest')
        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertEqual(body['symbol'], 'AAPL')
        self.assertEqual(body['shares'], 100)
        self.assertEqual(body['price'], 150.25)
        self.assertEqual(body['opened_at'], '2026-01-02T14:30:00+00:00')
        self.assertEqual(body['note'], 'breakout retest')

        response = self.client.get('/api/positions/')
        self.assertEqual(len(response.json()), 1)

    def test_create_without_date_keeps_opened_at_null(self):
        response = self.create_position()
        self.assertEqual(response.status_code, 201)
        self.assertIsNone(response.json()['opened_at'])

    def test_side_defaults_to_buy_and_accepts_sell(self):
        self.assertEqual(self.create_position().json()['side'], 'buy')
        self.assertEqual(self.create_position(side='sell').json()['side'], 'sell')

    def test_invalid_side_falls_back_to_buy(self):
        self.assertEqual(self.create_position(side='SHORT').json()['side'], 'buy')

    def test_patch_side(self):
        position_id = self.create_position().json()['id']
        response = self.client.patch(f'/api/positions/{position_id}/', {'side': 'sell'},
                                     content_type='application/json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['side'], 'sell')

    def test_create_requires_symbol_shares_and_price(self):
        self.assertEqual(self.create_position(symbol='  ').status_code, 400)
        self.assertEqual(self.create_position(shares='many').status_code, 400)
        self.assertEqual(self.create_position(price=None).status_code, 400)

    def test_invalid_date_is_ignored(self):
        response = self.create_position(opened_at='not-a-date')
        self.assertEqual(response.status_code, 201)
        self.assertIsNone(response.json()['opened_at'])

    def test_patch_fields(self):
        position_id = self.create_position().json()['id']
        response = self.client.patch(f'/api/positions/{position_id}/',
                                     {'shares': 250, 'price': 155, 'note': 'added',
                                      'opened_at': '2026-02-03T09:00:00Z'},
                                     content_type='application/json')
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body['shares'], 250)
        self.assertEqual(body['price'], 155)
        self.assertEqual(body['note'], 'added')
        self.assertEqual(body['opened_at'], '2026-02-03T09:00:00+00:00')

    def test_patch_rejects_non_numeric_shares(self):
        position_id = self.create_position().json()['id']
        response = self.client.patch(f'/api/positions/{position_id}/', {'shares': 'x'},
                                     content_type='application/json')
        self.assertEqual(response.status_code, 400)

    def test_patch_clears_the_date_with_null(self):
        position_id = self.create_position(opened_at='2026-01-02T14:30:00Z').json()['id']
        response = self.client.patch(f'/api/positions/{position_id}/', {'opened_at': None},
                                     content_type='application/json')
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.json()['opened_at'])

    def test_delete(self):
        position_id = self.create_position().json()['id']
        response = self.client.delete(f'/api/positions/{position_id}/')
        self.assertEqual(response.status_code, 204)
        self.assertEqual(self.client.get('/api/positions/').json(), [])

    def test_owner_isolation(self):
        position_id = self.create_position().json()['id']
        self.client.defaults['HTTP_AUTHORIZATION'] = \
            f'Token {Token.objects.create(user=self.other).key}'

        self.assertEqual(self.client.get('/api/positions/').json(), [])
        self.assertEqual(self.client.delete(f'/api/positions/{position_id}/').status_code, 404)
