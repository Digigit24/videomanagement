# Video Manager - Multi-Bucket MVP

Complete video management system with secure streaming from multiple Zata S3 buckets.

## Tech Stack

**Frontend**
- React + Vite + TypeScript
- Tailwind CSS + ShadCN UI
- React Player
- React Router

**Backend**
- Node.js + Express
- PostgreSQL (Neon)
- JWT Authentication
- AWS S3 SDK (Zata compatible)

## Features

- Multi-bucket video management
- Secure video streaming through backend
- Video status management (Draft, In Review, Approved, Published, Archived)
- Real-time dashboard statistics
- Search and filter videos
- Responsive UI

## Setup Instructions

### 1. Prerequisites

- Node.js 18+ installed
- PostgreSQL database (Neon recommended)
- Zata S3 credentials and buckets

### 2. Environment Configuration

Copy `.env.example` to `.env` in the root directory:

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
PORT=5000

ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=your_secure_password
JWT_SECRET=your_jwt_secret_here

DATABASE_URL=postgresql://USER:PASSWORD@HOST/DB?sslmode=require

ZATA_ACCESS_KEY=your_access_key
ZATA_SECRET_KEY=your_secret_key
ZATA_ENDPOINT=https://idr01.zata.ai
ZATA_BUCKETS=bucket1,bucket2,bucket3
```

### 3. Backend Setup

```bash
cd server
npm install
```

The database will be automatically initialized on first run.

### 4. Frontend Setup

```bash
cd frontend
npm install
```

## Running the Application

### Development Mode

**Terminal 1 - Backend:**
```bash
cd server
npm run dev
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

Access the application at `http://localhost:3000`

### Production Mode

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

## Default Login

- Email: `admin@example.com` (or whatever you set in `.env`)
- Password: `changeme` (or whatever you set in `.env`)

## API Endpoints

- `POST /api/login` - Authenticate admin
- `GET /api/buckets` - List available buckets
- `GET /api/videos?bucket=xyz` - List videos from bucket
- `GET /api/video/:id?bucket=xyz` - Get video details
- `PATCH /api/video/:id/status` - Update video status
- `GET /api/stream/:id?bucket=xyz` - Stream video securely

## Database Schema

```sql
CREATE TABLE videos (
  id UUID PRIMARY KEY,
  bucket TEXT NOT NULL,
  filename TEXT NOT NULL,
  object_key TEXT NOT NULL,
  size BIGINT NOT NULL,
  status TEXT DEFAULT 'Draft',
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  UNIQUE(bucket, object_key)
);
```

## Security Features

- JWT-based authentication
- Secure video streaming (no direct S3 access)
- Credential validation on all endpoints
- Bucket validation against ENV whitelist
- CORS protection
- SSL/TLS for database connection

## Supported Video Formats

- MP4 (.mp4)
- MOV (.mov)
- WebM (.webm)

## Project Structure

```
.
├── server/
│   ├── routes/         # API routes
│   ├── controllers/    # Request handlers
│   ├── middleware/     # Auth & validation
│   ├── services/       # Business logic
│   ├── db/            # Database setup
│   └── utils/         # Utilities
│
└── frontend/
    ├── src/
    │   ├── components/ # UI components
    │   ├── pages/      # Route pages
    │   ├── hooks/      # Custom hooks
    │   ├── services/   # API services
    │   ├── types/      # TypeScript types
    │   └── lib/        # Utilities
    └── ...
```

## Production Deployment

### Backend
1. Set all environment variables
2. Ensure DATABASE_URL points to production DB
3. Run `npm start`
4. Deploy to your hosting service (Heroku, Railway, etc.)

### Frontend
1. Build: `npm run build`
2. Serve the `dist` folder with any static hosting
3. Ensure API proxy is configured correctly

### Database
- Neon PostgreSQL handles SSL automatically
- No manual schema setup required (auto-initialized)

## Troubleshooting

**Videos not appearing:**
- Check Zata credentials in `.env`
- Verify bucket names are correct
- Ensure bucket contains video files (.mp4, .mov, .webm)

**Login fails:**
- Verify ADMIN_EMAIL and ADMIN_PASSWORD in `.env`
- Check JWT_SECRET is set

**Database errors:**
- Confirm DATABASE_URL is correct
- Ensure SSL mode is enabled for Neon

**Streaming issues:**
- Videos must be accessible with provided Zata credentials
- Check ZATA_ENDPOINT is correct
- Verify object keys match exactly

## License

MIT
