import fs from 'node:fs';
const dest='public/assets/firebase-config.json';
const env=process.env;
if (env.SGA_FIREBASE_API_KEY && env.SGA_FIREBASE_PROJECT_ID && env.SGA_FIREBASE_APP_ID) {
  const config={apiKey:env.SGA_FIREBASE_API_KEY,authDomain:env.SGA_FIREBASE_AUTH_DOMAIN||`${env.SGA_FIREBASE_PROJECT_ID}.firebaseapp.com`,projectId:env.SGA_FIREBASE_PROJECT_ID,appId:env.SGA_FIREBASE_APP_ID};
  fs.writeFileSync(dest,JSON.stringify(config,null,2));
  console.log('Configuração pública Firebase gerada para o build.');
} else if (!fs.existsSync(dest)) {
  console.log('Firebase não configurado; login permanecerá indisponível até a configuração.');
}
