from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('market', '0011_bar_barcoverage'),
    ]

    operations = [
        migrations.AddField(
            model_name='session',
            name='stage',
            field=models.PositiveSmallIntegerField(blank=True, choices=[(1, 1), (2, 2), (3, 3), (4, 4)], null=True),
        ),
    ]
