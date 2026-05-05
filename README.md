# Travelbot — AI Agents Backend

Node.js / Express backend that powers the **Travelbot** mobile app. It orchestrates a small fleet of OpenAI-driven agents that build city activity lists, propose locations, generate day-by-day travel programs, answer chat questions about a user's trips, and identify landmarks from a photo. Firebase (Firestore) is used for persistence and caching; Google Maps and Tiqets enrich the LLM output with real-world data.

This repo is one of three that make up Travelbot:

| Repo | Role |
| --- | --- |
| **[Agents_ai_travel_app](https://github.com/HabaAndrei/Agents_ai_travel_app)** *(this repo)* | Express API + AI agents |
| [Travel_app](https://github.com/HabaAndrei/Travel_app) | React Native (Expo) mobile client |
| [travelbot-presentation](https://github.com/HabaAndrei/travelbot-presentation) | Next.js marketing / presentation site |

---

## Features

- **Multi-agent AI pipeline** — five specialised generators run in `aiGeneration/`:
  - `ActivityGenerator` — proposes activity categories for a city
  - `LocationGenerator` — picks concrete places (enriched with Google Maps + Tiqets)
  - `ProgramGenerator` — builds an optimised day-by-day itinerary
  - `ChatResponseGenerator` — answers trip-aware chat questions
  - `ImageLocationGenerator` — recognises a landmark from a base64 photo
- **Structured LLM output** — every model call is validated against a `zod` schema before being returned to the client
- **Parallelised calls** — agents fan out with `Promise.all` to keep latency low
- **Firestore caching** — recurring lookups (e.g. place details) are cached so the same prompt is not paid for twice
- **Signed requests** — every protected endpoint verifies an HMAC-style hash (`sha256(body + shared_token)`) sent in the `Authorization` header
- **Transactional email** — verification codes via Nodemailer using a Gmail-style SMTP account
- **Image pipeline** — `sharp` resizes user-uploaded photos before they reach the LLM

## Tech stack

- **Runtime:** Node.js 18+, Express 4
- **AI:** OpenAI SDK (`openai`) + `zod` for response schemas
- **Data:** Firebase Admin (Firestore)
- **External APIs:** Google Maps / Address Validation, Tiqets
- **Mail:** Nodemailer
- **Tests:** Jest

## Project layout

```
.
├── express.js                # HTTP entrypoint (port 5050)
├── aiGeneration/             # The five AI agents
├── prompts/                  # System + user prompts (JSON) and PromptLoader
├── providers/                # Singletons: EnvConfig, Firebase, OpenaiClient
├── handlers/                 # Express middleware (auth, validation, response)
├── mailer/                   # Nodemailer + email templates
├── diverse/                  # Misc helpers (e.g. fuzzy destination search)
├── config/                   # ai_config.json, country/city dataset, email content
├── model/                    # ConfigLoader
├── images/                   # Static image output (served at /images)
└── tests.test.js             # Jest tests
```

## API

All protected routes require an `Authorization` header containing
`sha256(JSON.stringify(body) + AUTHORIZATION_CUSTOM_TOKEN)`.

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `POST` | `/ai-generation` | yes | Dispatch to one of the AI agents via `generationType`: `generateActivities`, `generateLocations`, `generateProgram`, `generateChatResponse` |
| `POST` | `/find-image-location` | yes | Identify a landmark from a base64 image |
| `POST` | `/send-code-email-verification` | no | Send an email containing a verification code |
| `GET`  | `/search-destination` | no | Fuzzy search across the bundled country/city dataset |

## Getting started (local)

### 1. Prerequisites

- Node.js **18+** and npm
- An **OpenAI** API key
- A **Google Maps** API key (Places + Geocoding enabled)
- A **Firebase** project with Firestore enabled and a downloaded **service account JSON**
- An SMTP-capable mailbox (Gmail with an app password works) for sending verification emails
- *(Optional)* A Tiqets API token if you want ticketed-attraction enrichment

### 2. Clone & install

```bash
git clone https://github.com/HabaAndrei/Agents_ai_travel_app.git
cd Agents_ai_travel_app
npm install
```

### 3. Configure environment

Copy the example file and fill it in:

```bash
cp .env.example .env
```

| Variable | Description |
| --- | --- |
| `API_KEY_OPENAI` | OpenAI API key |
| `API_KEY_GOOGLE_MAP` | Google Maps API key |
| `EMAIL_ACCOUNT` / `EMAIL_PASSWORD` | SMTP credentials (use an **app password**, not your real password) |
| `URL_SERVER` | Public URL of this server (used inside email templates) |
| `TIQETS_API_TOKEN` | Tiqets partner token (optional) |
| `AUTHORIZATION_CUSTOM_TOKEN` | Shared secret used to sign requests — must match the value set in the mobile app |
| `GOOGLE_SERVICE_ACCOUNT_*` | All fields from your Firebase service account JSON. For `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` keep the literal `\n` sequences — the code replaces them at runtime. |

### 4. Run

There is no `start` script defined yet, so run the server directly:

```bash
node express.js
# → express is listening on port 5050
```

Health check:

```bash
curl "http://localhost:5050/search-destination?input=Lisbon&country=Portugal"
```

### 5. Tests

```bash
npx jest
```

## Deployment notes

- The server binds to port `5050`; put a reverse proxy (Nginx, Cloudflare, Render, Fly, …) in front of it for TLS.
- Mount a persistent volume for `images/` if you want generated/processed images to survive restarts.
- Make sure the **same** `AUTHORIZATION_CUSTOM_TOKEN` is configured on the mobile client, otherwise every protected request will return `401`.

## Connecting the mobile app

In the [Travel_app](https://github.com/HabaAndrei/Travel_app) `.env`, point these variables at this server:

```
EXPO_PUBLIC_ADDRESS_FUNCTION_AI_GENERATION=http://<host>:5050/ai-generation
EXPO_PUBLIC_ADDRESS_FUNCTION_FUZZY=http://<host>:5050/search-destination
EXPO_PUBLIC_ADDRESS_FUNCTION_SEND_CODE_VERIFICATION=http://<host>:5050/send-code-email-verification
EXPO_PUBLIC_SERVER_ADDRESS_FIND_LOCATION=http://<host>:5050/find-image-location
EXPO_PUBLIC_SERVER_ADDRESS_IMAGES=http://<host>:5050/images
EXPO_PUBLIC_AUTHORIZATION_CUSTOM_TOKEN=<same value as backend>
```

## License

No license has been declared yet. Until one is added, treat the code as **all rights reserved** — open an issue if you want to use it.
