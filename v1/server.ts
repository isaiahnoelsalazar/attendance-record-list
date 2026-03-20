import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, 'data.json');

async function ensureDataFile() {
  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.writeFile(DATA_FILE, JSON.stringify({
      users: [],
      records: [],
      gaps: []
    }, null, 2));
  }
}

async function readData() {
  const data = await fs.readFile(DATA_FILE, 'utf-8');
  return JSON.parse(data);
}

async function writeData(data: any) {
  await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
}

async function startServer() {
  await ensureDataFile();
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // API Routes
  app.get('/api/users', async (req, res) => {
    const data = await readData();
    res.json(data.users);
  });

  app.post('/api/users', async (req, res) => {
    const data = await readData();
    const newUser = { ...req.body, id: Date.now().toString() };
    data.users.push(newUser);
    await writeData(data);
    res.json(newUser);
  });

  app.get('/api/records', async (req, res) => {
    const data = await readData();
    res.json(data.records);
  });

  app.post('/api/records', async (req, res) => {
    const data = await readData();
    const newRecord = { ...req.body, id: Date.now().toString() };
    data.records.push(newRecord);
    await writeData(data);
    res.json(newRecord);
  });

  app.put('/api/records/:id', async (req, res) => {
    const data = await readData();
    const index = data.records.findIndex((r: any) => r.id === req.params.id);
    if (index !== -1) {
      data.records[index] = { ...data.records[index], ...req.body };
      await writeData(data);
      res.json(data.records[index]);
    } else {
      res.status(404).json({ error: 'Record not found' });
    }
  });

  app.get('/api/gaps', async (req, res) => {
    const data = await readData();
    res.json(data.gaps);
  });

  app.post('/api/gaps', async (req, res) => {
    const data = await readData();
    const newGap = { ...req.body, id: Date.now().toString(), status: 'pending' };
    data.gaps.push(newGap);
    await writeData(data);
    res.json(newGap);
  });

  app.put('/api/gaps/:id', async (req, res) => {
    const data = await readData();
    const index = data.gaps.findIndex((g: any) => g.id === req.params.id);
    if (index !== -1) {
      data.gaps[index] = { ...data.gaps[index], ...req.body };
      await writeData(data);
      res.json(data.gaps[index]);
    } else {
      res.status(404).json({ error: 'Gap not found' });
    }
  });

  // Vite middleware for development
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
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
