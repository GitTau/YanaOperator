# YanaOS (Operations App)

YanaOS is the core operational application for Yana (Yantron Technology Pvt. Ltd.), an EV 2-wheeler fleet-as-a-service startup. 

**This application is exclusively for internal use by ZAP Point Captains, Supervisors, and Admins.**

## Core Capabilities 🚀
- **Rider Onboarding:** Full digital KYC, plan selection, and asset allocation. 
- **Fleet & Asset Management:** Real-time tracking of Vehicles (XERO) and Batteries (EMO/Flowatt).
- **Payment & Settlements:** Financial dashboard with built-in payment gate logic (preventing dispatch on overdue accounts).
- **Battery Swaps:** Digital swap registry with low-battery auto-flagging.
- **Maintenance Lifecycle:** Tracking minor/major repairs, triggering SLA monitors, and Supervisor-only QC checkoffs.
- **EOD Reporting:** Built-in daily reconciliation for fleet statuses and cash control.

## Tech Stack 🛠
- **Frontend Framework:** React Native with Expo (SDK 55)
- **Target OS:** Android ONLY (iOS is completely out of scope for development/updates)
- **Routing:** Expo Router (File-based routing)
- **State Management:** Zustand (Global State) & TanStack React Query (Server State caching & polling)
- **Database & Auth:** Supabase (Postgres, Auth v2, Storage, Edge Functions)
- **UI Design System:** Custom built per internal `DESIGN_OPS.md` guidelines

## Setup & Running Locally 💻

### 1. Prerequisites
- Node.js (v18+)
- [Expo Go](https://expo.dev/go) app on your device (Must match the SDK version running locally) OR configure a Development Build via EAS.
- Access to the Yana Supabase project (`kaoelfcaiegjjhyrrlak`)

### 2. Installation
```bash
npm install
```

### 3. Environment Variables
Create a `.env` file in the root directory and add your Supabase credentials. Do not commit actual live keys:
```env
EXPO_PUBLIC_SUPABASE_URL=your_supabase_project_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 4. Start the Application
```bash
npx expo start --clear
```

## Security & Architecture Notes 🔒
- **RLS (Row Level Security):** Data scoping is enforced entirely at the Supabase database level. Captains only see data tied to their authenticated `auth.jwt() -> zap_point_id`.
- **Atomic Operations:** All critical path write operations (booking creation, swaps, payments) are executed via Supabase RPC functions (`create_booking`, `swap_assets`, `record_payment`) to guarantee database transaction integrity.
- **Offline Reliability:** (WIP) Support for offline queuing using Expo SQLite for areas with spotty cellular reception. 

## Ownership
© 2026 Yantron Technology Pvt. Ltd. All rights reserved.
