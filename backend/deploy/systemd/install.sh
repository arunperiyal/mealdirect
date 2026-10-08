#!/bin/sh
# Install and start the mealdirect systemd service for this checkout.
# Run on the server as: sudo backend/deploy/systemd/install.sh
set -eu
[ "$(id -u)" -eq 0 ] || { echo "Run with sudo: sudo $0" >&2; exit 1; }

here=$(cd "$(dirname "$0")" && pwd)
deploy_dir=$(dirname "$here")
# The user who ran sudo owns the checkout and is in the docker group
user=${SUDO_USER:-$(stat -c %U "$deploy_dir")}
[ -f "$deploy_dir/.env.production" ] || { echo "Missing $deploy_dir/.env.production" >&2; exit 1; }
id -nG "$user" | grep -qw docker || { echo "$user isn't in the docker group" >&2; exit 1; }

sed -e "s|@USER@|$user|" -e "s|@DEPLOY_DIR@|$deploy_dir|" "$here/mealdirect.service" > /etc/systemd/system/mealdirect.service
systemctl daemon-reload
systemctl enable mealdirect
# Takes over containers that are already running, without recreating them
systemctl restart mealdirect
sleep 5
systemctl --no-pager status mealdirect | head -15
