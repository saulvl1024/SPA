import 'dotenv/config';
import { createApp } from './app.js';
import { startScheduler } from './lib/scheduler.js';

const app = createApp();
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`SÉRÈN API en http://localhost:${PORT}`);
  startScheduler(); // envíos automáticos diarios (si WA_AUTO_HOUR está definido)
});
