#!/bin/bash
# Double-click to start Collector's two local servers:
#   http  :8000  — cert download + fallback
#   https :8443  — the app (iOS share sheet needs https)
cd "$(dirname "$0")"
ruby -run -e httpd . -p 8000 -b 0.0.0.0 > /tmp/collector-http.log 2>&1 &
ruby serve-https.rb > /tmp/collector-https.log 2>&1 &
sleep 1
IP=$(ipconfig getifaddr en0 2>/dev/null || echo 192.168.1.234)
echo "Collector is running."
echo "  iPhone (app):   https://$IP:8443"
echo "  iPhone (cert):  http://$IP:8000/certs/collector.crt"
echo "Close this window to keep them running in the background."
open "https://localhost:8443"
wait
