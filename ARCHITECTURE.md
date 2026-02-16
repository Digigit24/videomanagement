# Architecture Documentation

## System Overview

```
┌─────────────┐         ┌─────────────┐         ┌──────────────┐
│   Browser   │────────▶│   Backend   │────────▶│  PostgreSQL  │
│  (React)    │◀────────│  (Express)  │◀────────│   (Neon)     │
└─────────────┘         └─────────────┘         └──────────────┘
                              │
                              │
                              ▼
                        ┌──────────────┐
                        │  Zata S3     │
                        │  (Storage)   │
                        └──────────────┘
```

## Frontend Architecture

### Technology Stack
- **React 18**: UI framework
- **TypeScript**: Type safety
- **Vite**: Build tool & dev server
- **React Router**: Client-side routing
- **Tailwind CSS**: Utility-first styling
- **ShadCN UI**: Component library
- **React Player**: Video streaming
- **Axios**: HTTP client

### Directory Structure
```
frontend/src/
├── components/        # Reusable UI components
│   ├── ui/           # ShadCN base components
│   ├── Header.tsx
│   ├── BucketSwitcher.tsx
│   ├── DashboardCards.tsx
│   ├── VideoTable.tsx
│   └── VideoPlayer.tsx
├── pages/            # Route components
│   ├── Login.tsx
│   ├── Dashboard.tsx
│   └── VideoDetail.tsx
├── hooks/            # Custom React hooks
│   ├── useAuth.ts
│   └── useBucket.ts
├── services/         # API integration
│   └── api.service.ts
├── types/            # TypeScript definitions
│   └── index.ts
├── lib/              # Utilities
│   ├── api.ts        # Axios instance
│   └── utils.ts      # Helper functions
├── App.tsx           # Root component
└── main.tsx          # Entry point
```

### State Management
- **Local State**: React hooks (`useState`, `useEffect`)
- **Auth State**: `useAuth` hook + localStorage
- **Bucket State**: `useBucket` hook + localStorage
- **Video State**: Component-level state

### API Communication
```typescript
// Centralized API client
api.ts → Axios instance with:
  - Base URL configuration
  - JWT token injection
  - Error handling
  - Auto-logout on 401

// Service layer
api.service.ts → Domain-specific API calls:
  - authService
  - bucketService
  - videoService
```

## Backend Architecture

### Technology Stack
- **Node.js 18+**: Runtime
- **Express**: Web framework
- **PostgreSQL**: Database
- **AWS S3 SDK**: Zata storage client
- **JWT**: Authentication
- **bcrypt**: Password hashing

### Directory Structure
```
server/
├── routes/           # API route definitions
│   └── index.js
├── controllers/      # Request handlers
│   ├── auth.js
│   ├── bucket.js
│   └── video.js
├── middleware/       # Express middleware
│   └── auth.js
├── services/         # Business logic
│   ├── storage.js
│   └── video.js
├── db/               # Database layer
│   ├── schema.sql
│   └── index.js
├── utils/            # Utilities
│   └── logger.js
├── app.js            # Express app
└── server.js         # Entry point
```

### Request Flow
```
Request → Route → Middleware → Controller → Service → Database/Storage
                    ↓
            [Auth, Validation]
```

### Middleware Chain
1. **CORS**: Allow frontend origin
2. **JSON Parser**: Parse request body
3. **Auth Middleware**: Verify JWT token
4. **Bucket Validation**: Ensure bucket exists in ENV
5. **Controller**: Handle business logic

## Database Schema

### Videos Table
```sql
videos
├── id            UUID (PK)
├── bucket        TEXT
├── filename      TEXT
├── object_key    TEXT
├── size          BIGINT
├── status        TEXT
├── created_at    TIMESTAMP
└── updated_at    TIMESTAMP

Indexes:
- PRIMARY KEY (id)
- UNIQUE (bucket, object_key)
- INDEX (bucket)
- INDEX (status)
- INDEX (filename)
```

### Design Decisions
- **UUID Primary Key**: Distributed system friendly
- **Bucket + Object Key Unique**: Prevent duplicates
- **Indexes**: Fast filtering by bucket, status, filename
- **Timestamps**: Audit trail

## Authentication Flow

```
┌─────────────┐
│ 1. Login    │
│   Request   │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ 2. Validate │
│  Credentials│
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ 3. Generate │
│  JWT Token  │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ 4. Store in │
│ localStorage│
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ 5. Include  │
│  in Headers │
└─────────────┘
```

## Video Streaming Flow

```
┌─────────────────┐
│ 1. Request      │
│  /api/stream/:id│
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 2. Verify JWT   │
│  + Bucket       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 3. Get Video    │
│  from Database  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 4. Fetch from   │
│  Zata S3        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 5. Stream to    │
│  Browser        │
└─────────────────┘
```

## Bucket Synchronization

```typescript
// On every /api/videos request:
1. List objects from Zata S3
2. Filter video files (.mp4, .mov, .webm)
3. Upsert to database:
   - INSERT new videos
   - UPDATE size if changed
   - ON CONFLICT DO UPDATE
4. Return database records
```

### Benefits
- **Always Fresh**: Reflects S3 state
- **Metadata Storage**: Status in database
- **Fast Queries**: Search/filter without S3 calls

## Security Layers

### 1. Authentication
- JWT tokens (7-day expiry)
- HTTP-only localStorage
- Auto-logout on token expiration

### 2. Authorization
- Single admin user
- All endpoints except `/login` require auth
- Token validation on every request

### 3. Input Validation
- Bucket whitelist from ENV
- Video file type filtering
- SQL injection prevention (parameterized queries)

### 4. Secure Streaming
- No direct S3 URLs exposed
- Backend proxy for all video access
- Token required for streaming

### 5. Environment Security
- Credentials in ENV only
- `.env` in `.gitignore`
- SSL/TLS for database

## Performance Optimizations

### Frontend
- **Code Splitting**: Route-based lazy loading
- **Vite HMR**: Fast development updates
- **Tailwind Purge**: Minimal CSS bundle

### Backend
- **Connection Pooling**: Reuse database connections
- **Stream Responses**: Video streaming (no buffering)
- **Async/Await**: Non-blocking I/O

### Database
- **Indexes**: Fast lookups on bucket, status, filename
- **Unique Constraints**: Prevent duplicate queries
- **Timestamps**: Efficient updates

## Error Handling

### Frontend
```typescript
try {
  await api.call()
} catch (error) {
  // Display user-friendly message
  // Log to console
  // Auto-logout on 401
}
```

### Backend
```javascript
try {
  // Business logic
} catch (error) {
  console.error('Error:', error)
  res.status(500).json({ error: 'Message' })
}
```

### Global Error Handler
```javascript
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err)
  res.status(500).json({ error: 'Internal server error' })
})
```

## Deployment Architecture

### Development
```
Frontend (localhost:3000)
   ↓ Vite Proxy
Backend (localhost:5000)
   ↓
Database (Neon)
   ↓
Zata S3
```

### Production
```
Frontend (Vercel/Netlify CDN)
   ↓ HTTPS
Backend (Railway/Heroku)
   ↓ SSL
Database (Neon)
   ↓ HTTPS
Zata S3 (idr01.zata.ai)
```

## Scalability Considerations

### Current Limits
- Single admin user
- Single backend instance
- Direct database queries

### Future Scaling
- **Multiple Users**: Add users table + role-based auth
- **Load Balancing**: Multiple backend instances
- **Caching**: Redis for frequently accessed data
- **CDN**: CloudFront for video delivery
- **Queue**: Background jobs for sync operations

## Technology Choices

### Why React?
- Component reusability
- Strong ecosystem
- TypeScript support
- Fast with Vite

### Why Express?
- Lightweight
- Flexible middleware
- Easy integration
- Large ecosystem

### Why PostgreSQL?
- ACID compliance
- JSON support
- Robust indexing
- Neon hosting

### Why Zata S3?
- Client requirement
- S3-compatible API
- Cost-effective storage
- Regional presence

## Development Workflow

```
1. Feature Branch
   ↓
2. Local Development
   ↓
3. Testing
   ↓
4. Code Review
   ↓
5. Merge to Main
   ↓
6. Deploy
```

## Monitoring & Logging

### Backend Logs
- Request/Response logs
- Error logs
- Database query logs

### Frontend Logs
- Console errors
- API failures
- User actions

### Database Metrics
- Connection count
- Query performance
- Storage usage

## Maintenance Tasks

### Daily
- Monitor error logs
- Check video streaming

### Weekly
- Review database performance
- Update dependencies (security patches)

### Monthly
- Database backup verification
- Security audit
- Performance optimization

## Future Enhancements

1. **Pagination**: Handle large video lists
2. **Upload**: Direct video upload to S3
3. **Thumbnails**: Auto-generate video previews
4. **Analytics**: View counts, watch time
5. **Multi-tenancy**: Multiple organizations
6. **Bulk Operations**: Mass status updates
7. **Video Metadata**: Tags, descriptions
8. **Search**: Full-text search
9. **Notifications**: Email/webhook on status change
10. **API Rate Limiting**: Prevent abuse
