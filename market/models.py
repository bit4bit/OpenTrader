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


STAGE_CHOICES = [(n, n) for n in range(1, 5)]


class Session(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='sessions')
    folder = models.ForeignKey(Folder, null=True, blank=True, on_delete=models.SET_NULL, related_name='sessions')
    name = models.CharField(max_length=100)
    layout = models.JSONField(default=dict, blank=True)
    notes = models.TextField(blank=True, default='')
    favorite = models.BooleanField(default=False)
    portfolio = models.BooleanField(default=False)
    stage = models.PositiveSmallIntegerField(null=True, blank=True, choices=STAGE_CHOICES)
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


class Bar(models.Model):
    """One provider-fetched market bar, permanently stored.

    Past bars never change (raw OHLCV is not re-stated by later dividends
    or splits), so once a window has been fetched it is answered from
    here without touching the provider again.
    """
    provider = models.CharField(max_length=20)
    symbol = models.CharField(max_length=50)
    interval = models.CharField(max_length=10)
    time = models.IntegerField()
    open = models.FloatField(null=True)
    high = models.FloatField(null=True)
    low = models.FloatField(null=True)
    close = models.FloatField(null=True)
    volume = models.FloatField(null=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['provider', 'symbol', 'interval', 'time'], name='unique_bar'),
        ]

    def __str__(self):
        return f'{self.symbol} {self.interval} {self.time}'


class BarCoverage(models.Model):
    """A provider fetch window already absorbed into stored bars.

    Coverage is tracked per request, not per bar: missing exchange days
    (holidays, halts) are indistinguishable from fetch gaps in bar
    timestamps, so "the provider was asked for this range" is the honest
    record. Windows are union-merged so a request only re-fetches segments
    of the immutable region that were truly never fetched.
    """
    provider = models.CharField(max_length=20)
    symbol = models.CharField(max_length=50)
    interval = models.CharField(max_length=10)
    start = models.IntegerField()
    end = models.IntegerField()

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['provider', 'symbol', 'interval', 'start', 'end'], name='unique_coverage'),
        ]

    def __str__(self):
        return f'{self.symbol} {self.interval} [{self.start}, {self.end})'


class UserPreference(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='preference')
    active_folder = models.ForeignKey(Folder, null=True, blank=True, on_delete=models.SET_NULL)
    note = models.TextField(blank=True, default='')
    show_session_quotes = models.BooleanField(default=False)

    def __str__(self):
        return f'{self.user.username}: preferences'
