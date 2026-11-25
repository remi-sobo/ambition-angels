# BloomOS

The operating system for nonprofits, at app.bloomos.org.

The Ambition Angels website is a separate repo (`remi-sobo/ambition-angels`). It reaches BloomOS only through the intake API, and BloomOS reads its daily numbers from the website's stats feed.

```bash
npm ci
cp .env.example .env.local   # fill in
npm run dev                  # http://localhost:3000 → /admin
```

See `CLAUDE.md` for how the app is laid out.
