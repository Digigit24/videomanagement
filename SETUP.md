# Quick Setup Guide

## Step-by-Step Installation

### 1. Environment Setup

```bash
# Copy environment template
cp .env.example .env

# Edit .env with your credentials
# Required: DATABASE_URL, ZATA credentials, ADMIN credentials
```

### 2. Install Backend

```bash
cd server
npm install
```

### 3. Install Frontend

```bash
cd frontend
npm install
```

### 4. Run Application

**Terminal 1 (Backend):**
```bash
cd server
npm run dev
```

**Terminal 2 (Frontend):**
```bash
cd frontend
npm run dev
```

### 5. Access Application

Open browser to: `http://localhost:3000`

Login with credentials from `.env`:
- Email: `ADMIN_EMAIL`
- Password: `ADMIN_PASSWORD`

## Database Initialization

Database is **automatically** initialized on first backend startup.

No manual SQL execution needed.

## Required Environment Variables

```env
# Server
PORT=5000

# Admin Credentials
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=changeme
JWT_SECRET=supersecret

# Database (Neon PostgreSQL)
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DB?sslmode=require

# Zata S3 Storage
ZATA_ACCESS_KEY=your_key
ZATA_SECRET_KEY=your_secret
ZATA_ENDPOINT=https://idr01.zata.ai
ZATA_BUCKETS=bucket1,bucket2
```

## Verification Checklist

- [ ] `.env` file created with all credentials
- [ ] Backend running on port 5000
- [ ] Frontend running on port 3000
- [ ] Can login with admin credentials
- [ ] Can switch between buckets
- [ ] Videos appear in dashboard
- [ ] Can play videos
- [ ] Can change video status

## Common Issues

**Port already in use:**
```bash
# Change PORT in .env
PORT=5001
```

**Database connection failed:**
- Verify DATABASE_URL format
- Ensure SSL mode is enabled

**No videos showing:**
- Check bucket names in ZATA_BUCKETS
- Verify Zata credentials
- Ensure bucket contains video files

**Login not working:**
- Double-check ADMIN_EMAIL and ADMIN_PASSWORD
- Verify JWT_SECRET is set
- Clear browser localStorage

## Production Build

**Backend:**
```bash
cd server
npm start
```

**Frontend:**
```bash
cd frontend
npm run build
npm run preview
```

## Support

For issues, check:
1. All environment variables are set
2. Database is accessible
3. Zata credentials are valid
4. Bucket names are correct
