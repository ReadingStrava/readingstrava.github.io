# Reading Strava

Static PWA prototype for a Strava-like reading tracker. It is built to run well on GitHub Pages and be installable from a phone browser with "Add to Home Screen".

## Features

- Mobile-first dashboard with reading streaks, weekly pace, goals, and leaderboard
- Quick log form that stores reading sessions in `localStorage`
- Activity feed with Strava-inspired session cards and applause actions
- Offline support through a service worker

## Local Preview

Because the app registers a service worker, preview it through a local server instead of opening `index.html` directly.

```powershell
python -m http.server 8080
```

Then open `http://localhost:8080`.
