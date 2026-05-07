
# 0) 준비물

- 보유 도메인 ( erp.qutat.com )
- 코드 레포 (FastAPI + Vite)
- Google OAuth 2.0 (프로덕션 세팅)
	- Google Cloud Console → Credentials → OAuth 2.0 Client**에서 프로덕션 도메인을 등록
		- Authorized **JavaScript origins**:
		    - `https://erp.qutat.com`
		- Authorized **redirect URIs**:
		    - `https://erp.qutat.com/api/auth/google/callback`
		    - (FastAPI 라우트에 맞춰 경로 조정)
- backend.env 및 frontend.env
- app.conf (첨부파일 참고)

```
# backend.env
GOOGLE_REDIRECT_URI=https://erp.qutat.com/api/auth/google/callback
APP_BASE_URL=https://erp.qutat.com

# frontend.env
VITE_API_BASE_URL=https://erp.qutat.com/api
```

# 1) Lightsail 인스턴스 만들기 & 고정 IP & 방화벽

1. Lightsail에서 **최신 Ubuntu LTS (24)** 인스턴스 생성
2. **Static IP(고정 IP)**를 인스턴스에 붙임
3. Lightsail 네트워킹 탭에서 **열 포트**:
    - 22(SSH), 80(HTTP), 443(HTTPS)만 **허용**
    - 8000 같은 내부앱 포트는 **열지 않습니다**(내부에서만 리슨)

# 2) 도메인 연결 (DNS)

- `A` 레코드: `erp.qutat.com` → Lightsail **Static IP**
- **전파 확인**: `nslookup erp.qutat.com`

# 3) 서버 기본 셋업

```
sudo apt update && sudo apt -y upgrade
sudo apt -y install nginx certbot python3-certbot-nginx git python3-venv build-essential curl

# Node, pnpm 설치 - nvm 권장
curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install --lts
node -v && npm -v

# pnpm 설치
curl -fsSL https://get.pnpm.io/install.sh | sh -
source ~/.bashrc
pnpm -v

# poetry 설치
curl -sSL https://install.python-poetry.org | python3 -

# 설치 후 PATH 반영 (bash 기준)
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
poetry --version
```

# 4) 코드 가져오기 & 빌드

```
git clone <YOUR_REPO_URL> ~/erp
cp ~/backend.env ~/erp/api/.env
cp ~/frontend.env ~/erp/ui/.env

# 프런트엔드(Vite) 빌드
cd ~/erp/ui
git pull
pnpm i
pnpm run build
sudo mkdir /var/www/app
sudo rsync -a dist/ /var/www/app/dist/

# 백엔드(FastAPI) 설치 & 로컬 실행 테스트
cd ~/erp/api/app
poetry install
poetry run uvicorn main:app --host 127.0.0.1 --port 8000
```

# 5) systemd 서비스로 FastAPI 상시 구동


 /etc/systemd/system/app-backend.service
```
[Unit]
Description=FastAPI (Uvicorn) backend via poetry
After=network.target

[Service]
User=ubuntu
WorkingDirectory=/home/ubuntu/erp/api/app
EnvironmentFile=/home/ubuntu/erp/api/.env
ExecStart=/home/ubuntu/.local/bin/poetry run uvicorn main:app --host 127.0.0.1 --port 8000 --proxy-headers --forwarded-allow-ips="*"
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```


```
sudo systemctl daemon-reload
sudo systemctl enable --now app-backend
systemctl status app-backend --no-pager
```

# 6) Nginx 리버스 프록시 + 정적 서빙 + SPA Fallback

##### 레이트리밋(DDOS 완화) 존 정의 포함:

/etc/nginx/conf.d/ratelimit.conf
```
# IP당 요청 속도 제한(약 분당 1000회 ≈ 16~17 r/s)
limit_req_zone $binary_remote_addr zone=req_per_ip:20m rate=17r/s;

# IP당 동시 커넥션 수 제한
limit_conn_zone $binary_remote_addr zone=conn_per_ip:20m;
```

(~/deployment/app.conf 가 있다고 가정)
```
sudo cp ~/deployment/app.conf /etc/nginx/sites-enabled/app.conf
sudo nginx -t && sudo systemctl reload nginx
```

# 7) HTTPS(무료 인증서)

```
# Nginx 플러그인으로 한 방
sudo certbot --nginx -d erp.qutat.com

# 자동 갱신 크론/타이머 함께 설정됨. 점검:
sudo certbot renew --dry-run
```

# 8) 코드 업데이트(자동화)
```
bash ~/deployment/update.sh
```