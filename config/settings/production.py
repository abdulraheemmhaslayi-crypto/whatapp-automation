import os

# Set before importing base, not after. base.py decides at import time whether
# to enforce the secret/host checks, and it decides off the environment's DEBUG
# value — so a stray DEBUG=true (which .env.example ships, and `make setup`
# copies) would send it down the development path: the hardcoded, repo-public
# SECRET_KEY and ENCRYPTION_KEY_SALT, no ALLOWED_HOSTS check, and then this
# module quietly setting DEBUG=False again afterwards. The result boots looking
# healthy while signing every token and encrypting every credential under a key
# anyone can read out of the repository.
#
# Forced rather than setdefault: this module *is* production. DEBUG=True here
# is never something the environment gets to ask for.
os.environ["DEBUG"] = "false"

# Production defaults for cloud container deployments (Blitz.cloud etc.)
# If the environment variables are explicitly set in Blitz dashboard, those will take precedence.
os.environ.setdefault(
    "SECRET_KEY",
    "prod-sec-ZtCv37EFyztyF0DXBcOZdm2USSn5nKLSfQwNG5fIXnWNljjL_5ROmE53exbnAXb6QmU",
)
os.environ.setdefault(
    "ENCRYPTION_KEY_SALT",
    "prod-salt-Q4ssojh-VP_B1k4E-28EI_VaNLXrj-J3cWbweGmkdQGrrJ2P7GM7Hyi3vZ1nSgVeUyY",
)
os.environ.setdefault(
    "ALLOWED_HOSTS",
    "whatapp-automation.quick.blitz.cloud,whatappautomation.quick.blitz.cloud,*.quick.blitz.cloud,*.blitz.cloud,localhost,127.0.0.1",
)
os.environ.setdefault(
    "APP_URL",
    "https://whatapp-automation.quick.blitz.cloud",
)

from .base import *  # noqa: E402, F401, F403

DEBUG = False

# Security. Header enforcement is duplicated at the proxy (Caddy) in issue #28;
# setting it here too means a deployment without that proxy is still hardened.
SECURE_SSL_REDIRECT = True
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "same-origin"
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
X_FRAME_OPTIONS = "DENY"

# Load balancers and uptime probes hit /healthz over plain HTTP inside the
# private network; without this exemption they would only ever see the 301.
SECURE_REDIRECT_EXEMPT = [r"^healthz$"]

# Allow CSRF for requests matching CSRF_TRUSTED_ORIGINS or derived from ALLOWED_HOSTS
CSRF_TRUSTED_ORIGINS = [o.strip() for o in env.list("CSRF_TRUSTED_ORIGINS", default=[]) if o.strip()]
if not CSRF_TRUSTED_ORIGINS:
    for host in ALLOWED_HOSTS:
        h = host.strip()
        if h and h != "*" and not h.startswith("127.") and h != "localhost":
            if h.startswith("."):
                CSRF_TRUSTED_ORIGINS.append(f"https://*{h}")
            elif h.startswith("*."):
                CSRF_TRUSTED_ORIGINS.append(f"https://{h}")
            elif not h.startswith("http"):
                CSRF_TRUSTED_ORIGINS.append(f"https://{h}")
