"""Gunicorn configuration for LandShark production."""

import multiprocessing

# Bind to localhost — Nginx handles external traffic
bind = "127.0.0.1:8001"

# Workers: 2x CPU cores + 1 (on a 1-vCPU droplet, this = 3)
workers = multiprocessing.cpu_count() * 2 + 1

# Timeout for long-running requests (AI analysis can be slow)
timeout = 120

# Logging
accesslog = "/var/log/landshark/gunicorn-access.log"
errorlog = "/var/log/landshark/gunicorn-error.log"
loglevel = "info"

# Graceful restart
graceful_timeout = 30
max_requests = 1000
max_requests_jitter = 50
