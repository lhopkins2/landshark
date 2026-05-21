"""Gunicorn configuration for LandShark production."""

# Bind to localhost — Nginx handles external traffic
bind = "127.0.0.1:8001"

# Fixed at 2 workers. The cpu*2+1 formula yields 3 on a 1-vCPU droplet,
# but each gunicorn worker holds ~200MB, and we share a 1.9GB server with
# qcluster. 2 workers is the right balance for memory-constrained deploys.
workers = 2

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
