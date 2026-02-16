# Production Deployment Guide

## Pre-Deployment Checklist

### Backend Requirements
- [ ] Node.js 18+ installed
- [ ] PostgreSQL database (Neon) provisioned
- [ ] Zata S3 credentials obtained
- [ ] Zata buckets created and accessible
- [ ] Domain/hosting configured

### Frontend Requirements
- [ ] Static hosting service selected
- [ ] Domain/CDN configured
- [ ] SSL certificate enabled

## Environment Configuration

### Production `.env`

```env
# Production values
PORT=5000

# Strong credentials for production
ADMIN_EMAIL=admin@yourdomain.com
ADMIN_PASSWORD=<strong-password>
JWT_SECRET=<long-random-string>

# Neon PostgreSQL (Production)
DATABASE_URL=postgresql://user:password@ep-xxx.region.aws.neon.tech/dbname?sslmode=require

# Zata Production Credentials
ZATA_ACCESS_KEY=<production-key>
ZATA_SECRET_KEY=<production-secret>
ZATA_ENDPOINT=https://idr01.zata.ai
ZATA_BUCKETS=prod-bucket1,prod-bucket2
```

### Security Best Practices

1. **Strong Passwords**: Use 20+ character passwords
2. **JWT Secret**: Generate with `openssl rand -base64 32`
3. **No Hardcoding**: Never commit `.env` to git
4. **SSL/TLS**: Enable HTTPS for production
5. **CORS**: Configure allowed origins in production

## Backend Deployment

### Option 1: Railway

```bash
# Install Railway CLI
npm i -g @railway/cli

# Login
railway login

# Initialize project
cd server
railway init

# Add environment variables
railway variables set PORT=5000
railway variables set DATABASE_URL="postgresql://..."
railway variables set ADMIN_EMAIL="admin@example.com"
railway variables set ADMIN_PASSWORD="secure-password"
railway variables set JWT_SECRET="your-secret"
railway variables set ZATA_ACCESS_KEY="key"
railway variables set ZATA_SECRET_KEY="secret"
railway variables set ZATA_ENDPOINT="https://idr01.zata.ai"
railway variables set ZATA_BUCKETS="bucket1,bucket2"

# Deploy
railway up
```

### Option 2: Heroku

```bash
# Login
heroku login

# Create app
cd server
heroku create your-app-name

# Add environment variables
heroku config:set PORT=5000
heroku config:set DATABASE_URL="postgresql://..."
heroku config:set ADMIN_EMAIL="admin@example.com"
heroku config:set ADMIN_PASSWORD="secure-password"
heroku config:set JWT_SECRET="your-secret"
heroku config:set ZATA_ACCESS_KEY="key"
heroku config:set ZATA_SECRET_KEY="secret"
heroku config:set ZATA_ENDPOINT="https://idr01.zata.ai"
heroku config:set ZATA_BUCKETS="bucket1,bucket2"

# Deploy
git push heroku main
```

### Option 3: VPS (DigitalOcean, AWS EC2)

```bash
# SSH into server
ssh user@your-server

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Clone repository
git clone <your-repo-url>
cd zata/server

# Install dependencies
npm install

# Setup .env
nano .env
# Paste production environment variables

# Install PM2
sudo npm install -g pm2

# Start application
pm2 start server.js --name video-manager

# Enable startup on reboot
pm2 startup
pm2 save

# Setup Nginx reverse proxy
sudo apt install nginx
sudo nano /etc/nginx/sites-available/video-manager

# Add nginx config:
# server {
#   listen 80;
#   server_name api.yourdomain.com;
#   location / {
#     proxy_pass http://localhost:5000;
#     proxy_http_version 1.1;
#     proxy_set_header Upgrade $http_upgrade;
#     proxy_set_header Connection 'upgrade';
#     proxy_set_header Host $host;
#     proxy_cache_bypass $http_upgrade;
#   }
# }

sudo ln -s /etc/nginx/sites-available/video-manager /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

# Setup SSL with Certbot
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d api.yourdomain.com
```

## Frontend Deployment

### Option 1: Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy
cd frontend
vercel

# Set environment variable (if needed)
# Update API base URL in src/lib/api.ts to production backend URL
```

### Option 2: Netlify

```bash
# Build production
cd frontend
npm run build

# Deploy via Netlify CLI
npm install -g netlify-cli
netlify login
netlify deploy --prod --dir=dist
```

### Option 3: Static Hosting (Nginx)

```bash
# Build frontend
cd frontend
npm run build

# Copy to server
scp -r dist/* user@server:/var/www/video-manager/

# Nginx config
server {
  listen 80;
  server_name yourdomain.com;
  root /var/www/video-manager;
  index index.html;

  location / {
    try_files $uri $uri/ /index.html;
  }

  location /api {
    proxy_pass http://localhost:5000;
  }
}
```

## Database Setup (Neon)

1. Sign up at https://neon.tech
2. Create new project
3. Create database
4. Copy connection string
5. Add to `DATABASE_URL` in backend `.env`

Database will auto-initialize on first backend startup.

## Post-Deployment Verification

### Backend Health Check
```bash
curl https://api.yourdomain.com/health
# Should return: {"status":"ok"}
```

### Test Login
```bash
curl -X POST https://api.yourdomain.com/api/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"your-password"}'
# Should return: {"token":"...", "email":"..."}
```

### Test Buckets
```bash
curl https://api.yourdomain.com/api/buckets \
  -H "Authorization: Bearer <token>"
# Should return: {"buckets":["bucket1","bucket2"]}
```

## Monitoring

### Backend Logs

**PM2:**
```bash
pm2 logs video-manager
```

**Railway:**
```bash
railway logs
```

**Heroku:**
```bash
heroku logs --tail
```

### Database Monitoring

Access Neon dashboard for:
- Connection stats
- Query performance
- Storage usage

## Scaling Considerations

### Vertical Scaling
- Increase server RAM/CPU as video traffic grows
- Monitor database connection pool usage

### Horizontal Scaling
- Add load balancer for multiple backend instances
- Use Redis for session storage (if needed)
- CDN for video streaming (CloudFront, Cloudflare)

### Cost Optimization
- Monitor Zata bandwidth usage
- Implement video caching
- Database query optimization

## Backup Strategy

### Database Backups
- Neon provides automatic daily backups
- Enable point-in-time recovery
- Test restore procedure monthly

### Environment Backups
- Store `.env` securely (1Password, AWS Secrets Manager)
- Document all configuration
- Version control infrastructure as code

## Security Hardening

1. **Rate Limiting**: Add rate limiting to API endpoints
2. **HTTPS Only**: Enforce SSL/TLS everywhere
3. **Security Headers**: Add helmet.js middleware
4. **Input Validation**: Sanitize all user inputs
5. **Audit Logs**: Log all admin actions
6. **Regular Updates**: Keep dependencies updated

## Rollback Plan

### Backend Rollback
```bash
# PM2
pm2 restart video-manager

# Railway/Heroku
git revert HEAD
git push
```

### Frontend Rollback
```bash
# Redeploy previous build
vercel rollback
```

## Support Contacts

- **Neon Support**: https://neon.tech/docs
- **Zata Support**: Contact your Zata account manager
- **App Issues**: Check logs and README troubleshooting

## Success Metrics

- [ ] Backend health endpoint responds
- [ ] Login works with production credentials
- [ ] Buckets load correctly
- [ ] Videos stream without buffering
- [ ] Status updates save instantly
- [ ] Dashboard stats accurate
- [ ] No console errors
- [ ] Mobile responsive
- [ ] SSL certificate valid
- [ ] Database backups enabled
