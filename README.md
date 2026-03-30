# DeedForge - Partnership Deed Generator

A web application for generating Indian partnership deed documents (DOCX) with support for 2-20 partners, Aadhaar card OCR auto-fill, and cloud-saved drafts.

## Features

- **Dynamic N-Partner Support** - Add 2 to 20 partners per deed with ordinal party labels (First Party, Second Party, etc.)
- **Aadhaar OCR Auto-Fill** - Scan Aadhaar cards individually or in bulk using Google Gemini Vision API; missing fields trigger warning toasts for manual entry
- **DOCX Generation** - Produces formatted partnership deed documents with dynamic partner sections and signature tables
- **Cloud Drafts** - Auto-save drafts to Supabase with sidebar listing, edit, duplicate, and delete functionality
- **Capital & Profit Management** - Per-partner capital contribution and profit/loss sharing with optional "same as capital" toggle
- **Authentication** - Supabase Auth integration with protected API endpoints

## Tech Stack

| Layer    | Technology                              |
|----------|-----------------------------------------|
| Frontend | Vanilla HTML, CSS, JavaScript (ES Modules) |
| Backend  | Node.js, Express                        |
| Database | Supabase (PostgreSQL + Auth)            |
| OCR      | Google Gemini Vision API                |
| Docs     | docx (npm package)                      |
| Hosting  | Vercel                                  |

## Project Structure

```
Partnership-deed/
├── backend/
│   ├── config/
│   │   ├── cors.js            # CORS configuration
│   │   └── rateLimit.js       # Rate limiters (API + OCR)
│   ├── docGenerator/
│   │   ├── constants.js       # Document styles and constants
│   │   ├── dateUtils.js       # Date formatting utilities
│   │   ├── headerFooter.js    # Document header/footer
│   │   ├── helpers.js         # Paragraph/text helpers
│   │   ├── index.js           # Main DOCX generation logic
│   │   └── tables.js          # Partner and signature tables
│   ├── middleware/
│   │   └── auth.js            # Supabase JWT auth middleware
│   ├── utils/
│   │   ├── audit.js           # Audit logging
│   │   ├── logger.js          # Console logger
│   │   └── supabase.js        # Supabase client setup
│   ├── .env.example           # Environment variable template
│   ├── ocr.js                 # Gemini Vision OCR module
│   ├── server.js              # Express app entry point
│   └── validation.js          # Zod request validation schemas
├── database/
│   └── supabase_setup.sql     # Database schema setup
├── frontend/
│   ├── css/
│   │   ├── components.css     # Toasts, modals, cards, toggles
│   │   ├── layout.css         # Page layout, sidebar, drafts
│   │   ├── main.css           # Base styles and form elements
│   │   └── variables.css      # CSS custom properties
│   ├── js/
│   │   ├── auth.js            # Supabase auth (login/signup/logout)
│   │   ├── config.js          # API URL and Supabase config
│   │   ├── main.js            # Core app logic (~2100 lines)
│   │   └── utils.js           # Alert toasts, helpers
│   ├── favicon.svg
│   ├── index.html             # Single-page app entry
│   └── robots.txt
├── .gitignore
├── package.json
├── package-lock.json
├── vercel.json                # Vercel deployment config
└── README.md
```

## Prerequisites

- Node.js >= 18.0.0
- A [Supabase](https://supabase.com) project (database + auth)
- A [Google Gemini API key](https://aistudio.google.com/apikey) (for Aadhaar OCR)

## Setup

### 1. Clone the repository

```bash
git clone <repo-url>
cd Partnership-deed
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env` and fill in:

```env
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
GEMINI_API_KEY=your_gemini_api_key_here
PORT=3003
```

### 4. Set up the database

Run the SQL in `database/supabase_setup.sql` against your Supabase project (via the SQL Editor in the Supabase dashboard).

### 5. Run the server

```bash
# Development (with auto-reload)
npm run dev

# Production
npm start
```

The app will be available at `http://localhost:3003`.

## API Endpoints

| Method | Endpoint            | Auth | Description                        |
|--------|---------------------|------|------------------------------------|
| POST   | `/generate`         | Yes  | Generate partnership deed DOCX     |
| POST   | `/api/ocr/aadhaar`  | Yes  | Extract data from Aadhaar card image via Gemini Vision |
| GET    | `/api/deeds`        | Yes  | List user's saved deeds            |
| POST   | `/api/deeds`        | Yes  | Save a new deed                    |
| PUT    | `/api/deeds/:id`    | Yes  | Update an existing deed            |
| DELETE | `/api/deeds/:id`    | Yes  | Delete a deed                      |
| GET    | `/api/deeds/:id`    | Yes  | Get a single deed by ID            |

### Rate Limits

- General API: default Express rate limit
- OCR endpoint: 40 requests per 15 minutes per IP
- Request body size: 5 MB max (to accommodate base64 Aadhaar images)

## Deployment

The project is configured for Vercel deployment via `vercel.json`. Push to your connected Git repository or run:

```bash
npx vercel --prod
```

## License

Private - All rights reserved.
