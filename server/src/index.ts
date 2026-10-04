import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import router from './routes/index.js';

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.use('/api', router);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'Paloma Express Server' });
});

app.listen(config.port, () => {
  console.log(`🕊️ Paloma Express Server running on http://localhost:${config.port}`);
});
