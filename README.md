# SGA — Sistema de Gestão de Ambiente

**Projeto independente de gestão de espaços para escolas, empresas e equipes.**

**Arquitetura:** Gabrielle Preis  
**Engenharia:** Thiago Ferreira de Oliveira (frontend e Firebase Authentication) e Gabriel Balbino Malaquias (backend).

**Documentação:** [Arquitetura e decisões técnicas](docs/ARQUITETURA.md) · [Equipe e responsabilidades](docs/EQUIPE-E-ESCOPO.md) · [Publicação](DEPLOY.md).

> **Estado:** frontend Angular e autenticação Firebase disponíveis na base atual; cadastros ainda locais. API Python e Neon PostgreSQL previstos para a próxima etapa de integração.

Interface Angular 20 independente com a logo SGA enviada, responsiva, tema claro/escuro e animações suaves.

## Iniciar localmente

```bash
npm install
cp public/assets/firebase-config.example.json public/assets/firebase-config.json
# Substitua os valores de exemplo pelos dados públicos do seu app Firebase Web
npm start
```

Acesse `http://127.0.0.1:4200`. O cadastro/login por **e-mail e senha** e o login por **Google** são realizados pelo Firebase Authentication. Para ativar, no Console Firebase crie um projeto, registre um **app Web**, habilite Authentication > Sign-in method > Email/Password e ative também o provedor **Google** (com e-mail de suporte). Em Authentication → Settings → Authorized domains, autorize `127.0.0.1` para testes nesse endereço e o domínio Vercel quando publicar. Copie `apiKey`, `authDomain`, `projectId` e `appId` para `public/assets/firebase-config.json`.

As credenciais de configuração Web do Firebase não são segredos, mas **nunca** coloque chaves privadas de Admin SDK, service accounts ou strings do Neon no Angular.

**Aviso:** novos usuários podem se registrar com e-mail/senha nesta versão. Não existe ainda fluxo de aprovação ou definição de coordenador, portanto o backend futuro deve impor papéis e permissões antes de qualquer uso institucional.

## Funcionalidades atuais

- Início público e acesso por Firebase Authentication; entrar com Google ou e-mail/senha, criar conta por e-mail/senha, recuperar senha por e-mail e sair.
- Painel, ambientes, pessoas com foto, reservas com o nome do ambiente digitado manualmente.
- Os registros começam vazios. Não são criados ambientes ou professores de exemplo.
- O frontend valida conflitos de data por nome do ambiente e responsável **somente no navegador**.
- Dados de gestão ficam no `localStorage`, separados pelo UID autenticado, **não sincronizados entre máquinas**. Fotos também ficam locais.
- Animações reagem à identidade claro/escuro e respeitam `prefers-reduced-motion`.

## Hospedagem frontend — Vercel

1. Envie esta pasta para um repositório Git e importe o projeto na Vercel.
2. Framework: Angular; build command `npm run build`; output directory `dist/sga/browser` (já presentes em `vercel.json`).
3. No projeto Vercel, configure as variáveis públicas abaixo no painel de ambiente:

```
SGA_FIREBASE_API_KEY=...
SGA_FIREBASE_AUTH_DOMAIN=seu-projeto.firebaseapp.com
SGA_FIREBASE_PROJECT_ID=seu-projeto
SGA_FIREBASE_APP_ID=...
```

O script `scripts/generate-firebase-config.mjs` gera o arquivo público durante o build. **Não** coloque credenciais do Neon nesse arquivo.
4. No Firebase Authentication > Settings > Authorized domains, adicione o domínio `seu-projeto.vercel.app` e o domínio próprio, quando houver. Também habilite Email/Password.
5. Faça o deploy. O domínio final e a ativação dependem das suas contas Firebase e Vercel.

## Banco Neon + API (para os agentes)

**Neon hospeda PostgreSQL, não o frontend.** Crie um banco no Neon, copie a connection string e configure `DATABASE_URL` **somente no backend** (ambiente servidor). Use conexão pooled para funções serverless. A API pode ser FastAPI (hospedada em serviço Python compatível) ou funções serverless da Vercel com suporte adequado.

Fluxo seguro esperado:

```
Angular → Firebase Auth (ID token) → API HTTPS
                                     ├─ verifica token com Firebase Admin SDK
                                     ├─ valida papel (coordenador/professor)
                                     ├─ verifica conflito dentro de transação
                                     └─ Neon PostgreSQL via DATABASE_URL no servidor
```

**O frontend ainda não consome API Neon**, nem autentica no backend. Os agentes deverão substituir `localStorage` pelos serviços HTTP, enviar `Authorization: Bearer <ID_TOKEN>`, implementar políticas de acesso e garantir isolamento por organização. Confirmações de reserva e bloqueio de conflitos precisam ser verificados no servidor, não só no Angular.

### Contrato inicial proposto

- `GET/POST/PATCH/DELETE /api/spaces` — nome, localização, tipo, capacidade.
- `GET/POST/PATCH/DELETE /api/people` — nome, função, e-mail, `photo_url`.
- `GET/POST/DELETE /api/bookings` — `space_name` (texto definido pelo coordenador), `person_id`, título, início e fim.
- `GET /api/me` — perfil autenticado e permissões por organização.

Para implementar produção: migrations, fotos em storage apropriado, controle de acesso, rate limiting, backups, testes e auditoria. Evite deixar a criação de contas aberta sem aprovação se somente coordenadores puderem entrar.

## Estrutura

- `src/app/app.component.ts` — lógica e autenticação Firebase no cliente.
- `src/app/app.component.html` — landing, login e dashboard.
- `src/styles.css` — paleta, animações e responsividade.
- `public/assets/sga-logo.png` — logotipo fornecido.
- `public/assets/firebase-config.example.json` — modelo de configuração Firebase pública.
- `scripts/generate-firebase-config.mjs` — geração para o build Vercel.
- `vercel.json` — build estático e roteamento SPA.

## Integração Google: como testar

1. No Firebase Console, confirme Authentication → Sign-in method → **Google: ativado** e **Email/Password: ativado**.
2. Registre um **Web App** em Configurações do projeto e copie as configurações públicas para `public/assets/firebase-config.json` (partindo do arquivo `firebase-config.example.json`). Não envie credenciais privadas.
3. Em Authentication → Settings → Authorized domains, inclua `127.0.0.1` se executar `npm start` nesse domínio (ou use `localhost` se estiver autorizado).
4. Rode `npm install` e `npm start`, entre na página de login e teste os dois botões: **Entrar** e **Entrar com Google**.
5. Depois do login, confirme que o e-mail aparece no painel e que o botão **Sair** encerra a sessão.

**Nota:** o Firebase autentica a identidade; isso ainda não torna o usuário coordenador. As regras de acesso devem ser implementadas e verificadas na API. Os ambientes e reservas continuam somente no navegador, não no Firebase nem Neon.

## Atualização desta versão

- Autenticação por senha e Google agora usa diretamente o usuário devolvido pelo Firebase, evitando redirecionamento antes da atualização da sessão.
- Login persistente com `browserLocalPersistence`; usuário logado volta ao painel ao reabrir a tela de acesso.
- Opção **Esqueci minha senha**.
- `npm start` também executa o gerador de configuração quando variáveis públicas `SGA_FIREBASE_*` estão disponíveis.

Para confirmar que o Firebase está conectado, verifique **Authentication → Users** no console após criar uma conta ou entrar com o Google.

Não foi possível confirmar `npm install`/`ng build` neste ambiente; execute `npm install && npm run build` na sua máquina e envie o erro se houver.


## Atualização — Nome de exibição e cadastro

- Contas Google exibem `user.displayName`, fornecido pelo Google, no cabeçalho. Caso o nome não esteja disponível, é exibida a parte do e-mail anterior ao `@`.
- Novas contas por e-mail/senha pedem nome completo e data de nascimento. O nome é gravado no Firebase Auth por `updateProfile` e aparece no cabeçalho.
- **Privacidade:** a data de nascimento é validada, mas ainda **não é persistida**, porque Firebase Auth não dispõe de campo específico para ela. Para armazená-la com segurança, será necessário criar o perfil privado no backend/Neon (ou Firestore com regras de acesso adequadas), implementar controles de acesso e definir finalidade/retenção. Não guarde datas de nascimento no `localStorage`.
- Para testar: crie uma nova conta com nome e data, entre novamente e confira a identificação do cabeçalho. Para contas existentes sem nome, será exibido provisoriamente o identificador do e-mail.


## V2 — Visual animado e banner preto profundo

- Banner de visão geral em preto profundo com sigla **SGA** animada, halos, brilho e partículas em CSS.
- Transições e microinterações em cartões, navegação, botões e landing page.
- Responsividade e `prefers-reduced-motion` preservados.
- Firebase Authentication não foi modificado. Copie seu `public/assets/firebase-config.json` da instalação anterior para esta pasta; nunca compartilhe credenciais privadas.


## Navegação V3 — Espaço de Trabalho no topo

A barra lateral foi substituída por navegação horizontal flutuante (glassmorphism), com abas Visão geral, Ambientes, Pessoas e Reservas. O topo se reorganiza em celulares. Novos efeitos: entrada deslizante do cabeçalho, indicador animado das abas, halo de fundo e brilho sutil em cartões. Todos respeitam `prefers-reduced-motion`. Firebase continua necessitando de `public/assets/firebase-config.json` próprio.


## Equipe do projeto (V4)

Landing page com fotos fornecidas dos participantes Thiago Ferreira de Oliveira, Gabriel Balbino Malaquias e Gabrielle Preis, incluindo seus cargos e links do LinkedIn. Navegação “Equipe” no topo, cartões animados e layout responsivo. As imagens são recursos estáticos em `public/assets/team/` e não dependem de Firebase nem da API.
