from rest_framework_simplejwt.authentication import JWTAuthentication
from django.conf import settings


class CookieJWTAuthentication(JWTAuthentication):
    """Reads JWT from httpOnly cookie"""

    def authenticate(self, request):
        raw_token = request.COOKIES.get(settings.JWT_AUTH_COOKIE)
        if raw_token is None:
            # Fallback to Authorization header for non-browser clients
            return super().authenticate(request)
        validated_token = self.get_validated_token(raw_token)
        return self.get_user(validated_token), validated_token
