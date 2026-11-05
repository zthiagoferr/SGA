# Publicação do SGA: Vercel + GitHub Pages + Neon

Este pacote mantém o login do Firebase e os dados locais do frontend. **O Neon só entrará em uso quando a API for implementada.** Não coloque `DATABASE_URL` em arquivos do Angular, no GitHub ou em variables `NG_APP_`.

## 1. GitHub (fonte do projeto)

1. Crie um repositório vazio no GitHub (ex.: `sga`).
2. No terminal, dentro desta pasta:

   ```bash
   git init
   git add .
   git commit -m "SGA: preparar publicacao"
   git branch -M main
   git remote add origin https://github.com/SEU_USUARIO/sga.git
   git push -u origin main
   ```

3. **Nunca faça commit** de `public/assets/firebase-config.json`, `.env` ou `DATABASE_URL`.

## 2. Vercel — hospedagem principal

1. Abra https://vercel.com/new, importe o repositório.
2. Configure Framework Preset: Angular (ou Other, se necessário).
3. Build command: `npm run build`.
4. Output directory: `dist/sga/browser`.
5. Configure `SGA_FIREBASE_API_KEY`, `SGA_FIREBASE_AUTH_DOMAIN`, `SGA_FIREBASE_PROJECT_ID`, `SGA_FIREBASE_APP_ID` nas **Environment Variables** da Vercel (usando os valores públicos do seu projeto Firebase).
6. Faça Deploy. O `vercel.json` já inclui rewrite para o roteamento do Angular.
7. Adicione o domínio `<nome-do-projeto>.vercel.app` em Firebase Authentication → Settings → Authorized domains.

## 3. GitHub Pages — publicação estática alternativa

1. No GitHub, Settings → Secrets and variables → Actions → New repository secret. Cadastre **os mesmos quatro nomes** de variáveis Firebase acima (os quatro são públicos, mas os secrets evitam pôr valores no código).
2. Settings → Pages → Build and deployment → Source: `GitHub Actions`.
3. Confirme a branch `main`: o workflow `.github/workflows/pages.yml` executa o build e publica.
4. URL padrão: `https://SEU_USUARIO.github.io/NOME_REPOSITORIO/`.
5. Adicione `SEU_USUARIO.github.io` a Authorized domains no Firebase (sem `https://` e sem a rota `/repositorio/`).
6. Caso publique como repositório especial `SEU_USUARIO.github.io` na raiz do domínio, altere `--base-href` no workflow para `/`.

## 4. Neon PostgreSQL — banco de dados (ainda NÃO conectado)

1. Entre em https://console.neon.tech/, crie um projeto PostgreSQL.
2. Abra Connect, selecione o banco e copie a connection string.
3. Armazene como `DATABASE_URL` **apenas no ambiente da API Python**, nunca no Angular.
4. Seus agentes de backend deverão verificar Firebase ID tokens no servidor, aplicar autorização por usuário/equipe, criar migrações e endpoints de ambientes/pessoas/reservas.
5. `database/schema-inicial.sql` é só um ponto de partida para modelagem.

## 5. Verificações necessárias antes de publicar

- `npm install` e `npm run build` sem erros.
- Teste login Google e e-mail/senha no domínio publicado.
- Teste carregamento de logos, fotos da equipe e navegação com hash no GitHub Pages.
- Confirme que nenhum arquivo com senha, URL do banco ou credenciais privadas foi enviado.
- **Ainda não há sincronização dos cadastros entre dispositivos.** Os dados permanecem no navegador.
- Revise avisos de segurança de `npm audit` antes de produção.
