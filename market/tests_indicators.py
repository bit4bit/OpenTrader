"""Tests for the custom indicator endpoints.

Scenarios: authentication, CRUD, and owner isolation through the real
REST stack (token auth + database).
"""
from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.authtoken.models import Token


class CustomIndicatorApiTests(TestCase):
    def setUp(self):
        self.user = User.objects.create(username='alice')
        self.other = User.objects.create(username='bob')
        self.client.defaults['HTTP_AUTHORIZATION'] = f'Token {Token.objects.create(user=self.user).key}'

    def create_indicator(self, name='My Script', code='plot(ta.sma(close, 20), {})'):
        return self.client.post('/api/indicators/', {'name': name, 'code': code},
                                content_type='application/json')

    def test_requires_authentication(self):
        self.client.defaults.pop('HTTP_AUTHORIZATION')
        response = self.client.get('/api/indicators/')
        self.assertEqual(response.status_code, 401)

    def test_create_and_list(self):
        response = self.create_indicator()
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()['name'], 'My Script')

        response = self.client.get('/api/indicators/')
        self.assertEqual(len(response.json()), 1)
        self.assertIn('code', response.json()[0])

    def test_create_requires_name(self):
        response = self.create_indicator(name='  ')
        self.assertEqual(response.status_code, 400)

    def test_patch_name_and_code(self):
        indicator_id = self.create_indicator().json()['id']
        response = self.client.patch(f'/api/indicators/{indicator_id}/',
                                     {'name': 'Renamed', 'code': '// v2'},
                                     content_type='application/json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['name'], 'Renamed')
        self.assertEqual(response.json()['code'], '// v2')

    def test_patch_rejects_empty_name(self):
        indicator_id = self.create_indicator().json()['id']
        response = self.client.patch(f'/api/indicators/{indicator_id}/', {'name': ''},
                                     content_type='application/json')
        self.assertEqual(response.status_code, 400)

    def test_delete(self):
        indicator_id = self.create_indicator().json()['id']
        response = self.client.delete(f'/api/indicators/{indicator_id}/')
        self.assertEqual(response.status_code, 204)
        self.assertEqual(self.client.get('/api/indicators/').json(), [])

    def test_owner_isolation(self):
        indicator_id = self.create_indicator().json()['id']
        self.client.defaults['HTTP_AUTHORIZATION'] = \
            f'Token {Token.objects.create(user=self.other).key}'

        self.assertEqual(self.client.get('/api/indicators/').json(), [])
        self.assertEqual(self.client.get(f'/api/indicators/{indicator_id}/').status_code, 404)
        self.assertEqual(self.client.patch(f'/api/indicators/{indicator_id}/', {'name': 'x'},
                                           content_type='application/json').status_code, 404)
        self.assertEqual(self.client.delete(f'/api/indicators/{indicator_id}/').status_code, 404)
