# blueChat Server

Backend server for blueChat - a Discord-like real-time communication platform.

## Tech Stack

- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js
- **Database**: PostgreSQL with Prisma ORM
- **Real-time**: Socket.io
- **Authentication**: JWT (JSON Web Tokens)
- **Validation**: Zod

## Features

- ✅ User authentication (register, login, JWT sessions)
- ✅ Server/Guild management (create, join, leave, delete)
- ✅ Channel management (text, voice, announcement, forum)
- ✅ Real-time messaging with Socket.io
- ✅ Message reactions, replies, pins, edits
- ✅ Role-based permissions
- ✅ Direct messages (1-on-1 and group)
- ✅ Friend system (add, accept, block)
- ✅ Voice channel presence
- ✅ Typing indicators
- ✅ User presence/status
- ✅ Audit logging
- ✅ Moderation (kick, ban, timeout)
- ✅ File attachments (S3/local)

## Setup

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- npm or yarn

### Installation

```bash
cd server
npm install
```

### Database Setup

1. Create a PostgreSQL database:
```sql
CREATE DATABASE bluechat;
```

2. Copy the environment file:
```bash
cp .env.example .env
```

3. Update `.env` with your database credentials:
```
DATABASE_URL="postgresql://user:password@localhost:5432/bluechat"
JWT_SECRET="your-secret-key"
```

4. Generate Prisma client and push schema:
```bash
npm run db:generate
npm run db:push
```

### Running

Development:
```bash
npm run dev
```

Production:
```bash
npm run build
npm start
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Get current user
- `PATCH /api/auth/profile` - Update profile

### Servers
- `GET /api/servers` - Get user's servers
- `POST /api/servers` - Create server
- `GET /api/servers/:id` - Get server details
- `PATCH /api/servers/:id` - Update server
- `DELETE /api/servers/:id` - Delete server
- `POST /api/servers/join` - Join via invite code
- `POST /api/servers/:id/leave` - Leave server

### Channels
- `GET /api/channels/:serverId` - Get channels
- `POST /api/channels` - Create channel
- `PATCH /api/channels/:id` - Update channel
- `DELETE /api/channels/:id` - Delete channel
- `GET /api/channels/:id/messages` - Get messages
- `POST /api/channels/:id/messages` - Send message
- `GET /api/channels/:id/search` - Search messages

### Messages
- `PATCH /api/messages/:id` - Edit message
- `DELETE /api/messages/:id` - Delete message
- `POST /api/messages/:id/reactions` - Toggle reaction
- `POST /api/messages/:id/pin` - Pin message

### Direct Messages
- `GET /api/dms` - Get DMs
- `POST /api/dms` - Create DM

### Friends
- `GET /api/friends` - Get friends list
- `POST /api/friends/request` - Send friend request
- `POST /api/friends/:id/accept` - Accept request
- `POST /api/friends/:id/decline` - Decline request
- `POST /api/friends/:id/block` - Block user

## Socket.io Events

### Client → Server
- `server:join` - Join server room
- `channel:join` - Join channel room
- `typing:start` / `typing:stop` - Typing indicators
- `voice:join` / `voice:leave` - Voice channel
- `voice:mute` / `voice:deafen` - Voice controls
- `presence:update` - Update status

### Server → Client
- `message:new` - New message
- `message:edit` - Message edited
- `message:delete` - Message deleted
- `message:reaction` - Reaction toggled
- `typing:update` - User typing
- `voice:user-joined` / `voice:user-left`
- `user:status` - User status changed

## Database Schema

See `prisma/schema.prisma` for the complete database schema.

Key models:
- `User` - User accounts
- `Server` - Servers/guilds
- `Channel` - Text, voice, forum channels
- `Message` - Chat messages
- `Role` - Server roles with permissions
- `DirectMessage` - DM conversations
- `FriendRequest` - Friend system
- `AuditLog` - Server audit trail

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | Required |
| `PORT` | Server port | 3001 |
| `JWT_SECRET` | JWT signing secret | Required |
| `CLIENT_URL` | Frontend URL for CORS | http://localhost:5173 |
| `NODE_ENV` | Environment | development |

## License

MIT
