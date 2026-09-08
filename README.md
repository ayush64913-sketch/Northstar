# Northstar Career Workspace

Northstar is a resume optimizer and curated job workspace with an Express backend.

## Run locally

```powershell
npm install
Copy-Item .env.example .env
npm start
```

Open http://localhost:3000.

Add `OPENAI_API_KEY` to `.env` to enable real resume analysis and cover-letter generation. Without it, the app uses local demo fallbacks.

## Deploy on Render

1. Push this folder to a GitHub repository.
2. In Render, choose **New > Blueprint** and select the repository.
3. Render reads `render.yaml`, installs dependencies, and starts the app.
4. Add `OPENAI_API_KEY` in the Render environment settings.
5. Open the generated `onrender.com` URL.

The current local JSON store and uploaded files are suitable for a demo deployment only. Before accepting real customer resumes, move them to durable storage and add authentication, a managed database, deletion controls, and payment verification.
