# Offline Queue POC

A proof of concept demonstrating offline-first form submissions with automatic synchronization when online.

## Features

- 📝 Form submission with text and image uploads
- 💾 Local storage using IndexedDB for offline support
- 🔄 Automatic sync when connection is restored
- ⚡ Real-time connection status monitoring
- 🎯 Queue management with retry logic

## Tech Stack

- **Frontend**: React + Vite
- **Form Handling**: react-hook-form
- **Storage**: IndexedDB (via `idb`)
- **Backend**: Express.js with Multer (mock API)
- **PWA**: Workbox for service workers

## Getting Started

### Prerequisites

- Node.js (v18+)
- pnpm

### Installation

```bash
pnpm install
```

### Development

Run both frontend and API server:

```bash
pnpm run dev:all
```

Or run them separately:

```bash
# Frontend (http://localhost:5173)
pnpm run dev

# Mock API (http://localhost:3001)
pnpm run dev:api
```

### Build

```bash
pnpm run build
```

## Project Structure

```txt
src/
├── components/
│   ├── SubmissionForm.jsx    # Main form component
│   └── StatusBar.jsx          # Connection status indicator
├── services/
│   ├── ApiClient.ts           # API communication
│   └── QueueManager.ts        # Offline queue logic
└── types/
    └── queue.ts               # TypeScript definitions
```

## How It Works

1. **Form Submission**: User fills out form with text fields and images
2. **Queue Storage**: Data is stored in IndexedDB queue
3. **Background Sync**: Service attempts to sync with API when online
4. **Status Updates**: Real-time feedback on queue status and connectivity
5. **Automatic Retry**: Failed submissions are automatically retried

## API Endpoints

- `POST /api/submissions` - Submit form data
- Uploads stored in `uploads/` directory

## License

Private project
