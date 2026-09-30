import express from 'express';
import cors from 'cors';
import router from './routes/index.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.use('/api', router);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'Paloma Express Server' });
});

app.listen(PORT, () => {
  console.log(`🕊️ Paloma Express Server running on http://localhost:${PORT}`);
});
