import { transformSync } from 'esbuild';
import fs from 'fs';
const files = [
 'src/pages/CRM.jsx','src/pages/Loyalty.jsx','src/pages/POS.jsx','src/pages/SystemConfig.jsx',
 'src/components/DealsBoard.jsx','src/components/Client360.jsx','src/components/Insights.jsx',
 'src/pages/Caja.jsx','src/pages/Inventory.jsx','src/pages/Staff.jsx','src/App.jsx','src/pages/Agenda.jsx'
];
let bad=0;
for (const f of files){
  try { transformSync(fs.readFileSync(f,'utf8'),{loader:'jsx'}); console.log('OK  ',f); }
  catch(e){ bad++; console.log('FAIL',f,'::',(e.errors&&e.errors[0]&&e.errors[0].text)||e.message); }
}
console.log(bad? `\n${bad} con errores`:'\n✅ Todos compilan (JSX válido)');
