from django.contrib.auth.models import User
from django.db import models


class Folder(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='folders')
    name = models.CharField(max_length=100)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        return f'{self.user.username}: {self.name}'


class Session(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='sessions')
    folder = models.ForeignKey(Folder, null=True, blank=True, on_delete=models.SET_NULL, related_name='sessions')
    name = models.CharField(max_length=100)
    layout = models.JSONField(default=dict, blank=True)
    notes = models.TextField(blank=True, default='')
    favorite = models.BooleanField(default=False)
    portfolio = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        return f'{self.user.username}: {self.name}'


class CustomIndicator(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='custom_indicators')
    name = models.CharField(max_length=100)
    code = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        return f'{self.user.username}: {self.name}'


class Position(models.Model):
    SIDE_CHOICES = [('buy', 'buy'), ('sell', 'sell')]
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='positions')
    symbol = models.CharField(max_length=50)
    side = models.CharField(max_length=4, choices=SIDE_CHOICES, default='buy')
    shares = models.FloatField()
    price = models.FloatField()
    opened_at = models.DateTimeField(null=True, blank=True)
    note = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['symbol', 'opened_at', 'created_at']

    def __str__(self):
        return f'{self.user.username}: {self.symbol} {self.shares}@{self.price}'


class UserPreference(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='preference')
    active_folder = models.ForeignKey(Folder, null=True, blank=True, on_delete=models.SET_NULL)
    note = models.TextField(blank=True, default='')

    def __str__(self):
        return f'{self.user.username}: preferences'
