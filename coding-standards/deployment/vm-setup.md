# VM Deployment (Backend APIs)

## Low-Cost VMs

| Provider | Instance | ~Cost/month |
|----------|----------|-------------|
| AWS EC2 | t3.micro (1vCPU, 1GB) | $8 |
| Azure | B1s (1vCPU, 1GB) | $7 |
| GCP | e2-micro (1GB) | $7 |

## Initial Setup (Ubuntu)

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git ufw nginx certbot python3-certbot-nginx
sudo ufw allow OpenSSH && sudo ufw allow 'Nginx Full' && sudo ufw enable
```

## Nginx Reverse Proxy

```nginx
server {
    listen 80;
    server_name api.yourdomain.com;
    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## SSL: `sudo certbot --nginx -d api.yourdomain.com`

## Deploy Options

**Node.js (PM2):** `pm2 start dist/index.js --name api && pm2 save && pm2 startup`

**Python (Docker):** `docker build -t api . && docker run -d -p 8000:8000 --env-file .env api`

**Golang (systemd):** Build binary, create systemd service, `systemctl enable api`

## CI/CD (GitHub Actions)

```yaml
- uses: appleboy/ssh-action@v1
  with:
    host: ${{ secrets.SERVER_HOST }}
    username: deploy
    key: ${{ secrets.SSH_PRIVATE_KEY }}
    script: |
      cd /home/deploy/app && git pull && docker compose build && docker compose up -d
```
