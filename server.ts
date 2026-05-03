import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import { google } from 'googleapis';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());
  app.use(cookieParser());
  app.use(session({
    secret: process.env.SESSION_SECRET || 'serviceflow-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: true, // required for SameSite=None
      sameSite: 'none',
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
  }));

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.APP_URL}/auth/callback`
  );

  // Auth URLs
  app.get('/api/auth/google/url', (req, res) => {
    const scopes = [
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/userinfo.email'
    ];
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent'
    });
    res.json({ url });
  });

  app.get('/auth/callback', async (req, res) => {
    const { code } = req.query;
    try {
      const { tokens } = await oauth2Client.getToken(code as string);
      // In a real app, store these in your DB linked to the user.
      // For this simple app, we'll store in session or return to client.
      res.send(`
        <html>
          <body>
            <script>
              window.opener.postMessage({ type: 'GOOGLE_AUTH_SUCCESS', tokens: ${JSON.stringify(tokens)} }, '*');
              window.close();
            </script>
            <p>Authentication successful. You can close this window now.</p>
          </body>
        </html>
      `);
    } catch (error) {
      console.error('Google Auth Error:', error);
      res.status(500).send('Authentication failed');
    }
  });

  // Calendar API Proxy
  app.post('/api/calendar/event', async (req, res) => {
    const { tokens, event } = req.body;
    if (!tokens) return res.status(401).json({ error: 'No tokens provided' });

    try {
      const auth = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
      );
      auth.setCredentials(tokens);
      const calendar = google.calendar({ version: 'v3', auth });

      const requestBody = {
        summary: `Appointment: ${event.name}`,
        description: `Phone: ${event.phone}\nAddress: ${event.address}\nNotes: ${event.notes}`,
        location: event.address,
        start: {
          dateTime: event.isoStart,
        },
        end: {
          dateTime: event.isoEnd,
        },
      };

      let response;
      if (event.calendarEventId) {
        response = await calendar.events.update({
          calendarId: 'primary',
          eventId: event.calendarEventId,
          requestBody,
        });
      } else {
        response = await calendar.events.insert({
          calendarId: 'primary',
          requestBody,
        });
      }

      res.json(response.data);
    } catch (error: any) {
      console.error('Calendar API Error:', error);
      const isInvalidGrant = error.message === 'invalid_grant' || 
                             error?.response?.data?.error === 'invalid_grant' ||
                             error?.response?.data?.error_description?.includes('invalid_grant');
                             
      if (isInvalidGrant) {
        res.status(401).json({ error: 'invalid_grant' });
      } else {
        const errorMsg = error?.response?.data?.error?.message || error?.response?.data?.error || error.message || 'Unknown calendar error';
        res.status(500).json({ error: errorMsg });
      }
    }
  });

  // Vite integration
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
