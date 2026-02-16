# Quick Start - 5 Minutes to Running

## Prerequisites
- Node.js 18+ installed
- Neon PostgreSQL database URL
- Zata S3 credentials

## Steps

### 1. Configure Environment (2 min)
```bash
cp .env.example .env
```

Edit `.env`:
```env
DATABASE_URL=postgresql://your-neon-url
ZATA_ACCESS_KEY=your-key
ZATA_SECRET_KEY=your-secret
ZATA_BUCKETS=bucket1,bucket2
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=secure123
JWT_SECRET=random-secret-string
```

### 2. Install Backend (1 min)
```bash
cd server
npm install
```

### 3. Install Frontend (1 min)
```bash
cd frontend
npm install
```

### 4. Start Backend (30 sec)
```bash
cd server
npm run dev
```

**Expected output:**
```
✓ Database initialized successfully
✓ Server running on http://localhost:5000
✓ Buckets: bucket1,bucket2
```

### 5. Start Frontend (30 sec)
Open new terminal:
```bash
cd frontend
npm run dev
```

**Expected output:**
```
VITE ready in 1234 ms
➜ Local: http://localhost:3000
```

## Access Application

1. Open browser: `http://localhost:3000`
2. Login with:
   - Email: `admin@example.com`
   - Password: `secure123`
3. Select bucket from dropdown
4. View videos!

## Troubleshooting

**Backend won't start?**
- Check DATABASE_URL is correct
- Ensure Zata credentials are valid

**No videos showing?**
- Verify bucket names in ZATA_BUCKETS
- Check buckets contain .mp4, .mov, or .webm files

**Login fails?**
- Confirm ADMIN_EMAIL and ADMIN_PASSWORD in .env
- Check JWT_SECRET is set

## Next Steps

- Read **README.md** for full documentation
- See **DEPLOYMENT.md** for production setup
- Check **ARCHITECTURE.md** for system design

## API Test

Test backend is working:
```bash
curl http://localhost:5000/health
# Should return: {"status":"ok"}
```

## Production Deploy

See **DEPLOYMENT.md** for:
- Railway deployment
- Heroku deployment
- VPS deployment
- Frontend hosting (Vercel/Netlify)

---

**Total time: 5 minutes**
**You're ready to go! 🚀**
