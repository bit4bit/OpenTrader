from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('market', '0013_note'),
    ]

    operations = [
        migrations.AddField(
            model_name='session',
            name='development',
            field=models.CharField(blank=True, choices=[('DV', 'In develop'), ('BO', 'Breakout'), ('BZ', 'Buy zone'), ('CP', 'Constructive pattern'), ('PB', 'Pullback')], max_length=2, null=True),
        ),
    ]