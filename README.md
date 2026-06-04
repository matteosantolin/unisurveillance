# UniSurveillance — Cloud Video Surveillance System

Multi-user cloud video surveillance system: mobile app takes periodic photos, cloud server analyzes them with YOLOv8 (person detection), web dashboard shows live data and manages email alerts based on time windows and thresholds. End-to-end authentication with Firebase Auth (JWT) and per-camera ownership enforced server-side.

---

## Architecture

```
[Mobile App (Expo SDK 54 / React Native)]
       │
       │ Firebase Auth (email/password, ID token persisted in AsyncStorage)
       │ Camera claim Firestore tx -> cameras/{id}.owner_uid
       │ POST /upload (every 10s) with Authorization: Bearer <ID token>
       ▼
[Flask Server — Google Cloud Run, 2 GiB RAM]
       │
       ├── @require_auth: verify_id_token Firebase Admin SDK
       ├── Ownership check: cameras/{id}.owner_uid == decoded.uid
       ├── YOLOv8n (class 0 person, conf 0.4, imgsz 416)
       ├── PIL bytes (no tempfile)
       ├── Firebase Storage (public photos, 30-day lifecycle)
       ├── Firestore (detections with owner_uid + boxes + cameras.last_seen)
       ├── Gmail SMTP (alert email, 1-min cooldown, filtered by owner)
       └── Structured JSON logging (camera_id, uid, doc_id)
       │
       ▼
[Firebase / Firestore]  ◄── onSnapshot live (queries filtered by owner_uid)
       │
       ▼
[React + Vite Web Dashboard — Firebase Hosting]
       ├── Firebase Auth login
       ├── Person timeline chart (Chart.js + zoom plugin, click → photo)
       ├── Photo modal with bounding box overlay (normalized SVG)
       ├── Camera list filtered server-side by owner_uid
       ├── CSV detection export
       ├── Hourly alert configuration (local input → UTC) with owner email
       └── /users/{uid} mirror for uid → email resolution in UI
```

### Multi-tenant ownership

- **Camera claim**: the first authenticated client using a `cameraId` binds it to their `uid` via an **atomic Firestore transaction** (mobile claims on first `START SURVEILLANCE`, dashboard claims on first `createAlertRule`).
- **Server**: every `/upload` verifies JWT, then compares `cameras/{id}.owner_uid` with the token's `uid` → 403 on mismatch.
- **Firestore rules**: `detections` and `cameras` readable only by owner or admin (rule `list` enforces `where owner_uid==uid` filter on queries).
- **Email alert**: server filters `alert_rules` by `cameras.owner_uid` → email sent only to the legitimate owner.

---

## Project Structure

```
uni-surveillance/
├── server/                                # Python Flask backend + YOLOv8
│   ├── app/
│   │   ├── __init__.py                    # create_app, CORS, init firebase + YOLO
│   │   ├── logging_config.py              # JSON formatter
│   │   ├── middleware/
│   │   │   └── auth.py                    # @require_auth Firebase ID token
│   │   ├── routes/
│   │   │   ├── upload.py                  # POST /upload (auth + ownership)
│   │   │   └── health.py                  # GET /health (public)
│   │   └── services/
│   │       ├── detection.py               # YOLO + bounding box [0,1]
│   │       ├── firebase_service.py        # Firestore + Storage + owner helpers
│   │       ├── alert_service.py           # SMTP Gmail, 1-min cooldown
│   │       └── time_window.py             # overnight time windows
│   ├── scripts/
│   │   └── backfill_detections_owner_uid.py  # one-off: adds owner_uid to legacy detections
│   ├── tests/
│   │   ├── test_alert_service.py          # 21 tests (path-load + mock)
│   │   └── test_auth_middleware.py        # 6 JWT decoder tests (mock verify_id_token)
│   ├── Dockerfile                         # python 3.11-slim, prefetch yolov8n.pt
│   └── requirements.txt
├── mobile/                                # Expo SDK 54 app
│   ├── app/
│   │   ├── _layout.tsx                    # AuthProvider + useProtectedRoute redirect
│   │   ├── index.tsx                      # Camera + START/STOP + claim + signout
│   │   ├── login.tsx                      # Email/password + error mapping
│   │   └── settings.tsx                   # Server URL + cameraId persisted
│   ├── contexts/
│   │   └── AuthContext.tsx                # user/loading/signIn/signOut, sync /users
│   ├── services/
│   │   ├── uploadService.ts               # fetch POST /upload with Bearer, 401 refresh
│   │   ├── cameraService.ts               # claimCamera Firestore transaction
│   │   └── userProfileService.ts          # sync /users/{uid} for uid→email
│   ├── firebase.ts                        # initializeAuth + getReactNativePersistence(AsyncStorage)
│   ├── hooks/useIntervalUpload.ts         # setInterval 10s + no-overlap lock
│   └── utils/cameraId.ts                  # generates cam-xxxxxx in AsyncStorage
└── dashboard/                             # React 18 + Vite dashboard
    ├── firebase.json                      # hosting + firestore.rules + storage.rules
    ├── firestore.rules                    # strict multi-tenant + /users self-or-admin
    ├── storage.rules                      # photos public read, write deny
    ├── cloudbuild.yaml                    # CI/CD pipeline (npm + vite + firebase deploy)
    └── src/
        ├── firebase.ts                    # init Firebase JS SDK
        ├── App.tsx                        # protected routing useAuth
        ├── pages/
        │   ├── Login.tsx
        │   ├── Dashboard.tsx              # filters + stats + chart + list
        │   └── AlertSettings.tsx          # CRUD alert rules + owner email
        ├── components/
        │   ├── PeopleChart.tsx            # Chart.js Line + zoom/pan, click → modal
        │   ├── PhotoModal.tsx             # SVG bounding box overlay
        │   └── AlertForm.tsx              # local time inputs → UTC
        ├── hooks/
        │   ├── useAuth.ts                 # onAuthStateChanged + sync /users
        │   ├── useCameras.ts              # query filtered where owner_uid==uid
        │   ├── useDetections.ts           # onSnapshot, date range, limit 500, owner filter
        │   └── useUserEmails.ts           # batch uid→email lookup with module cache
        ├── services/
        │   ├── authService.ts             # signIn / signOut Firebase
        │   ├── firestoreService.ts        # CRUD alert_rules + claim transaction
        │   └── userProfileService.ts      # sync /users/{uid} + fetch email
        └── utils/
            ├── exportCsv.ts               # CSV download
            └── timezone.ts                # localTimeToUtc / utcTimeToLocal
```

---

## Initial Setup

### 1. Firebase

1. Create a project on [Firebase Console](https://console.firebase.google.com)
2. Enable: **Authentication** (Email/Password), **Firestore**, **Storage**
3. Create a user from Authentication → Users
4. Download **Service Account JSON** from Settings → Service accounts
5. **Firestore Composite Indexes** — required for queries with `owner_uid` + `orderBy`. Firestore does not create them automatically: either click the "Create index" URL that appears in the error message on first run, or create them manually with gcloud:

   ```bash
   gcloud firestore indexes composite create --collection-group=cameras \
     --field-config=field-path=owner_uid,order=ASCENDING \
     --field-config=field-path=camera_id,order=ASCENDING

   gcloud firestore indexes composite create --collection-group=detections \
     --field-config=field-path=owner_uid,order=ASCENDING \
     --field-config=field-path=camera_id,order=ASCENDING \
     --field-config=field-path=timestamp,order=DESCENDING
   ```

   `alert_rules` does not require a composite index since queries use only equality filters (no `orderBy`).
6. **Security rules** are deployed by CI/CD (see CI/CD section)

### 2. Server (`/server`)

```bash
cd server
cp .env.example .env
# fill .env with FIREBASE_CREDENTIALS_JSON, FIREBASE_STORAGE_BUCKET, GMAIL_USER, GMAIL_APP_PASSWORD

# Local development
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python -m pytest tests/ -v   # 27/27 tests must pass
python main.py
```

**Environment variables:**

| Variable | Description |
|----------|-------------|
| `FIREBASE_CREDENTIALS_JSON` | Service account JSON on one line (Cloud Run uses Secret Manager) |
| `FIREBASE_STORAGE_BUCKET` | `your-project.firebasestorage.app` |
| `GMAIL_USER` | Sender Gmail address |
| `GMAIL_APP_PASSWORD` | 16-char App Password (requires Google 2FA enabled) |
| `YOLO_IMGSZ` | (opt) default 416 |
| `YOLO_CONFIDENCE` | (opt) default 0.4 |

**Manual Cloud Run deploy** (alternative to CI/CD):

```bash
gcloud run deploy your-server-name \
  --source . --region your-region \
  --allow-unauthenticated --memory 2Gi \
  --set-env-vars="FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app,GMAIL_USER=...,GMAIL_APP_PASSWORD=..." \
  --set-secrets="FIREBASE_CREDENTIALS_JSON=firebase-credentials:latest"
```

> Minimum 2 GiB RAM required (YOLOv8 + Flask ~1 GiB resident).
> `--allow-unauthenticated` means Cloud Run accepts anonymous connections: auth is enforced at the application level via the `@require_auth` decorator.

**Isolated sandbox deploy** (for testing a branch without touching prod):

```bash
gcloud run deploy your-server-name \
  --source . --region your-region \
  --no-traffic --tag my-test-tag
```

### 3. Mobile App (`/mobile`)

```bash
cd mobile
npm install --legacy-peer-deps
cp .env.example .env
# fill EXPO_PUBLIC_SERVER_URL with your Cloud Run URL

npx expo start
# Scan QR with Expo Go (Play Store / App Store)
```

Phone and PC on same WiFi. For different networks: `npx expo start --tunnel`.

Firebase config in `app.json` (`expo.extra.firebase`): apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId. The apiKey is a public client identifier; security comes from Firestore rules.

**APK build** via EAS:

```bash
eas build -p android --profile preview
```

**OTA update** (JS-only changes):

```bash
eas update --branch preview --message "Change description"
```

### 4. Web Dashboard (`/dashboard`)

```bash
cd dashboard
npm install
cp .env.example .env
# fill VITE_FIREBASE_* (6 keys from Firebase Console)

npm run dev          # local: http://localhost:5173
npm run build        # production
firebase deploy --only hosting
firebase deploy --only firestore:rules   # when rules change
```

---

## Automated CI/CD (Cloud Build)

Push to `master` → automatic deploy via Cloud Build trigger.

### Server

- **Trigger**: created by Cloud Run UI "Continuous Deployment"
- **Path filter**: `server/**`
- **Pipeline**: Docker build from `server/Dockerfile` → push Artifact Registry → deploy Cloud Run

### Dashboard

- **Trigger**: Cloud Build 2nd gen
- **Path filter**: `dashboard/**`
- **Config**: `dashboard/cloudbuild.yaml`
- **Steps**:
  1. `npm ci` (node:20)
  2. `vite build` with `VITE_FIREBASE_*` injected via substitutions
  3. `firebase deploy --only=hosting,firestore:rules,storage`

### IAM

The Cloud Run service account needs the following roles:
- `roles/run.admin`
- `roles/iam.serviceAccountUser`
- `roles/firebase.admin`
- `roles/firebaserules.admin`
- `roles/firebasehosting.admin`
- `roles/logging.logWriter`

---

## API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/health` | none | Health check |
| `POST` | `/upload` | **Bearer Firebase ID token** | Upload photo (form-data: `photo`, `camera_id`) |

**curl example** (replace `<ID_TOKEN>` with a valid Firebase ID token, retrievable from the dashboard DevTools via `auth.currentUser.getIdToken()`):

```bash
curl -X POST https://your-server-url/upload \
  -H "Authorization: Bearer <ID_TOKEN>" \
  -F "photo=@photo.jpg" \
  -F "camera_id=cam-abc123"
```

Success response:

```json
{
  "success": true,
  "doc_id": "abc123",
  "people_count": 2,
  "photo_url": "https://storage.googleapis.com/...",
  "timestamp": "2024-01-01T12:00:00+00:00"
}
```

| Status | Meaning |
|--------|---------|
| 200 | Detection processed and saved |
| 400 | Missing `photo` or `camera_id` field |
| 401 | Missing Authorization header or invalid/expired/revoked token |
| 403 | Camera not claimed or belongs to another user |
| 500 | Detection / Storage / Firestore error |

---

## Firestore Data Model

### Collection `detections`

```json
{
  "camera_id": "cam-abc123",
  "owner_uid": "UID_OF_OWNER",
  "timestamp": "2024-01-01T12:00:00Z",
  "people_count": 2,
  "photo_url": "https://storage.googleapis.com/...",
  "boxes": [
    {"x1": 0.12, "y1": 0.34, "x2": 0.45, "y2": 0.78, "confidence": 0.91}
  ],
  "img_width": 1920,
  "img_height": 1080
}
```

`boxes` coordinates normalized to [0,1] (resolution-invariant rendering). `owner_uid` written by server at upload time.

### Collection `alert_rules`

```json
{
  "camera_id": "cam-abc123",
  "start_time": "21:00",
  "end_time": "04:00",
  "threshold": 1,
  "recipient_email": "user@example.com",
  "active": true,
  "owner_uid": "UID_OF_OWNER",
  "created_at": "2024-01-01T14:00:00Z",
  "last_alert_sent": "2024-01-01T14:02:00Z"
}
```

- Trigger: `people_count >= threshold` AND `is_in_time_window(now_utc, start, end)` AND `now - last_alert_sent > 1 min`
- Times stored in **UTC** (dashboard auto-converts from/to local timezone)
- Overnight windows supported (e.g. `21:00 → 04:00`)

### Collection `cameras`

```json
{
  "camera_id": "cam-abc123",
  "last_seen": "2024-01-01T12:00:00Z",
  "owner_uid": "UID_OF_OWNER"
}
```

`owner_uid` set by the **first authenticated client** that claims the camera (mobile on first `START SURVEILLANCE` or dashboard on first `createAlertRule`). Atomic Firestore transaction guarantees first-write-wins. `last_seen` updated only by server via Admin SDK (bypasses rules).

### Collection `users`

```json
{
  "email": "user@example.com",
  "last_login": "2024-01-01T14:30:00Z"
}
```

Minimal Firebase Auth → Firestore mirror, written by client on login. Used to resolve `uid → email` in the UI.

---

## Security Rules

### Firestore (`dashboard/firestore.rules`)

- `admins/{uid}`: read authenticated (for `isAdmin()` check), write deny (manual management from console)
- `users/{uid}`: get self+admin, list admin-only, create/update self-only with field whitelist `[email, last_login]`, delete deny
- `detections`: read only if `owner_uid == auth.uid` or admin (client queries must include filter), write deny (server bypasses with Admin SDK)
- `alert_rules`:
  - read if `owner_uid == auth.uid` **OR** `isAdmin()`
  - create if `request.resource.data.owner_uid == auth.uid`
  - update/delete owner only (admin read-only)
- `cameras`:
  - get: owner, admin, or nonexistent doc (for claim transaction)
  - list: owner or admin (query must filter)
  - create: whitelist `[camera_id, owner_uid]`, must set `owner_uid = auth.uid`
  - update: whitelist `[camera_id, owner_uid, last_seen]`, `camera_id` and `owner_uid` immutable, `last_seen` modifiable only by server (Admin SDK)
  - delete deny

### Storage (`dashboard/storage.rules`)

- `photos/**`: public read (photos already `make_public()`), write deny
- Other paths: total deny

### Admin Role

A user becomes admin by manually creating the document `admins/{uid}` in Firestore Console. Example fields:

```json
{
  "email": "admin@example.com",
  "note": "Main admin",
  "created_at": "2024-01-01T00:00:00Z"
}
```

The `isAdmin` flag is computed by `useAuth` via `exists(admins/{uid})`. Admin sees all cameras and all rules; can only modify/delete their own (modifying others' rules = rule deny).

---

## Storage Lifecycle

Photos older than 30 days are automatically deleted:

```bash
gcloud storage buckets update gs://your-project.firebasestorage.app \
  --lifecycle-file=lifecycle.json
```

`lifecycle.json`:

```json
{
  "lifecycle": {
    "rule": [
      {
        "action": { "type": "Delete" },
        "condition": { "age": 30, "matchesPrefix": ["photos/"] }
      }
    ]
  }
}
```

---

## Tests

```bash
cd server
python -m pytest tests/ -v
```

**27 tests** across 2 files:

### `tests/test_alert_service.py` (21 tests)

**`TestIsInTimeWindow`** (13 tests): normal windows (inside/outside, inclusive boundaries), overnight windows (e.g. 23:00 → 06:00), same start = end, accepts `time` or `datetime`.

**`TestCheckAndSendAlerts`** (8 tests): below threshold → no email, above threshold in window → email, outside window → no email, active cooldown → skip, expired cooldown → email, multiple independent rules, empty list → no action, naive timestamp treated as UTC.

### `tests/test_auth_middleware.py` (6 tests)

`@require_auth` decorator with mock of `firebase_admin.auth.verify_id_token`:

- Missing `Authorization` header → 401
- Wrong prefix (`Token ...`) → 401
- Empty token → 401
- Valid token → 200 + `g.uid`/`g.email` populated
- `ExpiredIdTokenError` → 401 `Token expired`
- `InvalidIdTokenError` → 401 `Invalid token`

Tests run via **path-load** + stub: no dependency on Flask app / full firebase-admin / ultralytics.

---

## Dashboard Design

Direction: **Editorial Mission Control** — charcoal palette `#0B0B0E` + pink coral accent `#FF7B95`, sharp 1-2px borders.

**Typography:**
- Display: **Fraunces** (serif italic, editorial numbers 80px)
- UI: **Geist** (sans-tech, tracking 0.16-0.24em uppercase for labels)
- Data/timestamp: **JetBrains Mono**

**Features:**
- Sections with monospace labels (`01/TIMELINE`, `02/RECENT`) crossed by border
- Fixed 80px grid texture + SVG noise overlay
- Pink coral corner brackets on login modal and photo modal
- Pink coral bounding boxes with drop-shadow on photo modal
- Live indicator: pulsing mint dot
- Stats numbers in Fraunces italic 80px (detections · peak · average)
- Chart zoom/pan (wheel + drag + shift-pan, reset button)
- Admin badge for admin users
- Logged-in email + role in header

---

## Key Features

### Privacy by Default
- Default empty camera on Dashboard and AlertSettings dropdowns
- Stats/chart/list sections hidden until a camera is selected
- Multi-tenant: each camera claimed via atomic Firestore transaction
- Server rejects upload (403) if camera not claimed or belongs to another `uid`

### End-to-End Authentication
- Mobile and dashboard use the same Firebase Auth (email/password) → same `uid`
- JWT ID token auto-refresh every hour, persisted in AsyncStorage (mobile) / IndexedDB (dashboard)
- Server verifies token with `firebase_admin.auth.verify_id_token` (~1ms, offline with cached public key)
- Mobile upload auto-retries once with `getIdToken(true)` on 401

### Excel-Ready CSV Export
- `;` separator (default Italian Excel)
- UTF-8 BOM for correct accented characters
- Windows CRLF line endings

### Timezone-Friendly
- AlertSettings form: time inputs in browser's local timezone
- Save → automatic conversion to UTC via `utils/timezone.localTimeToUtc`
- Rule list display: reconversion UTC → local via `utcTimeToLocal`
- Server compares `now_utc` with rule's UTC start/end

---

## Legacy Detection Migration

Detections written before `owner_uid` was introduced are invisible under strict rules. Run the backfill once:

```bash
cd server
python -m scripts.backfill_detections_owner_uid --dry-run
python -m scripts.backfill_detections_owner_uid
```

The script reads `cameras/{camera_id}.owner_uid` for each detection without an owner and writes it to the document. Detections for cameras that were never claimed are ignored.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Server | Python 3.11, Flask 3.0, Ultralytics YOLOv8n, Pillow, firebase-admin |
| Mobile | Expo SDK 54, React Native 0.81, expo-camera, expo-router, Firebase JS SDK 10 |
| Dashboard | React 18, Vite 5, TypeScript, Chart.js, react-chartjs-2, chartjs-plugin-zoom, react-router |
| Firebase | Auth (email/password + ID token), Firestore, Storage, Hosting |
| Cloud | Cloud Run, Cloud Build (CI/CD), Secret Manager, Artifact Registry |
| Email | Gmail SMTP SSL (port 465) with app password |
