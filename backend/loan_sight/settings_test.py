from .settings import *  # noqa: F401, F403

SECRET_KEY = 'test-secret-key-for-tests-only-not-for-production-32plus'

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': 'loansight_test',
        'USER': 'postgres',
        'PASSWORD': 'postgres',
        'HOST': 'localhost',
        'PORT': '5433',
        'TEST': {
            'NAME': 'loansight_test',
        },
    }
}

CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
    }
}

# Disable password validators for easier test user creation
AUTH_PASSWORD_VALIDATORS = []

JWT_AUTH_COOKIE_SECURE = False

PASSWORD_HASHERS = [
    'django.contrib.auth.hashers.MD5PasswordHasher',
]
