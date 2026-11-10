from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('market', '0014_session_development'),
    ]

    operations = [
        migrations.AddField(
            model_name='session',
            name='rating',
            field=models.CharField(blank=True, choices=[('A', 'A'), ('B', 'B'), ('C', 'C'), ('D', 'D'), ('E', 'E')], max_length=1, null=True),
        ),
    ]
