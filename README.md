# CineVault — Separated Frontend & Backend Movie Portal

Is project me **Frontend** (Public User Website) aur **Backend** (API + Password-Protected Admin Panel) bilkul alag-alag folders me hain.

## Folder Structure
```text
CineVault_FullStack/
├── backend/                  <-- Sirf Admin ke liye (API + Admin Upload Panel)
│   ├── admin/
│   │   └── index.html        <-- Password-protected Admin Upload Page
│   ├── data/
│   │   └── movies.json       <-- Saare movies aur 480p/720p/1080p links yahan save hote hain
│   ├── package.json
│   └── server.js
│
└── frontend/                 <-- Sirf Users ke liye (No Upload Button, Clean Download UI)
    ├── config.js             <-- Backend API URL setting
    └── index.html            <-- User Movie Portal
```

---

## Step 1: Backend Kaise Chalayein (Admin Panel & API)
1. Terminal / Command Prompt kholein aur `backend` folder me jayein:
   ```bash
   cd CineVault_FullStack/backend
   ```
2. Dependencies install karein:
   ```bash
   npm install
   ```
3. Server start karein:
   ```bash
   npm start
   ```
4. **Admin Panel kholne ke liye:** Browser me `http://localhost:5000/admin` open karein.
   - **Default Password:** `admin123` (Ise `server.js` me `ADMIN_PASSWORD` change karke badal sakte hain).
   - Yahan se aap naye movies aur unke **480p, 720p, 1080p** download links add ya delete kar sakte hain.

---

## Step 2: Frontend Kaise Chalayein (Users ke liye)
1. `frontend/index.html` ko browser me open karein (ya VS Code Live Server / Netlify / Vercel / kisi bhi static hosting par upload karein).
2. Users ko **sirf movies dikhengi** aur wo **480p, 720p, 1080p** quality select karke download kar payenge — unhe koi upload ya admin option nahi dikhega.
3. Agar aap backend ko kisi live server (jaise Render, Railway, VPS) par deploy karte hain, to `frontend/config.js` me `API_BASE_URL` ko apne live backend URL se replace kar dein.
