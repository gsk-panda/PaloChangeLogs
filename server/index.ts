import express from 'express';
import cors from 'cors';
import routes from './routes';
import { startScheduler } from './scheduler';
import { closeDb } from './db';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());
app.use(routes);

const server = app.listen(PORT, () => {
  console.log(`[Server] Backend API running on port ${PORT}`);
  startScheduler();
});

process.on('SIGTERM', () => {
  console.log('[Server] Shutting down gracefully...');
  server.close(() => {
    closeDb();
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('[Server] Shutting down gracefully...');
  server.close(() => {
    closeDb();
    process.exit(0);
  });
});

