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


class UserPreference(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='preference')
    active_folder = models.ForeignKey(Folder, null=True, blank=True, on_delete=models.SET_NULL)

    def __str__(self):
        return f'{self.user.username}: preferences'
