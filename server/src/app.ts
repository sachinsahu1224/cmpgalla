import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { HttpError } from './errors';
import { authRouter } from './routes/auth';
import { companyRouter } from './routes/company';
import { customerRouter } from './routes/customers';
import { hsnRouter } from './routes/hsn';
import { invoiceRouter } from './routes/invoices';
import { productRouter } from './routes/products';
import { summaryRouter } from './routes/summary';

export function createApp() {
  const app = express();
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use('/api/auth/login', rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false }));
  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/auth', authRouter);
  app.use('/api/summary', summaryRouter);
  app.use('/api/company', companyRouter);
  app.use('/api/customers', customerRouter);
  app.use('/api/products', productRouter);
  app.use('/api/hsn', hsnRouter);
  app.use('/api/invoices', invoiceRouter);
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    console.error(error);
    res.status(500).json({ error: 'Something went wrong' });
  });
  return app;
}
