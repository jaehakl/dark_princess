#!/usr/bin/env bash
set -e
APP_DIR=/home/ubuntu/erp

echo "[1/4] Pull"
cd $APP_DIR
git pull

echo "[2/4] Frontend build"
cd $APP_DIR/ui
pnpm i
rm -r dist
pnpm run build
sudo rsync -a dist/ /var/www/app/dist/

echo "[3/4] Backend deps (옵션)"
cd $APP_DIR/api
poetry install

echo "[4/4] Restart services"
sudo systemctl restart app-backend
sudo nginx -t && sudo systemctl reload nginx

echo "Done."