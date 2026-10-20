from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('market', '0009_position_side'),
    ]

    operations = [
        migrations.AddField(
            model_name='userpreference',
            name='show_session_quotes',
            field=models.BooleanField(default=False),
        ),
    ]
