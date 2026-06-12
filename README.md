# 24h Le Mans — Multi-Team Manager

App de escalação de stints para corridas de endurance no iRacing.  
Deploy na Vercel com sync em tempo real via Firebase Firestore.

---

## ⚡ Setup em 5 passos

### 1. Firebase (gratuito)

1. Acesse https://console.firebase.google.com
2. Clique em **"Criar projeto"** → dê um nome (ex: `lemans-manager`)
3. Desative o Google Analytics → **Criar projeto**
4. No menu lateral: **Firestore Database** → **Criar banco de dados**
   - Modo: **Produção** → Localização: `us-east1` → Criar
5. **Regras do Firestore** → cole isso e publique:
   ```
   rules_version = '2';
   service cloud.firestore.beta.1 {
     match /databases/{database}/documents {
       match /{document=**} {
         allow read, write: if true;
       }
     }
   }
   ```
6. No menu lateral: **Configurações do projeto** (ícone ⚙️)
7. Role até **"Seus aplicativos"** → clique em `</>` (Web)
8. Registre o app (nome qualquer) → copie as credenciais

### 2. Variáveis de ambiente

Crie um arquivo `.env` na raiz do projeto:

```env
VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_AUTH_DOMAIN=seu-projeto.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=seu-projeto-id
VITE_FIREBASE_STORAGE_BUCKET=seu-projeto.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abcdef
```

### 3. Subir para o GitHub

```bash
cd lemans-manager
git init
git add .
git commit -m "init"
git remote add origin https://github.com/SEU_USUARIO/lemans-manager.git
git push -u origin main
```

### 4. Deploy na Vercel

1. Acesse https://vercel.com → **New Project**
2. Importe o repositório `lemans-manager`
3. Em **Environment Variables**, adicione as 6 variáveis do `.env`
4. Clique em **Deploy**

### 5. Compartilhar

Copie a URL da Vercel (ex: `lemans-manager.vercel.app`) e mande para todos os pilotos.  
**Qualquer alteração feita por qualquer pessoa aparece em tempo real para todos.**

---

## Como usar

- **Visão Geral**: resumo de todas as equipes
- **Aba de cada equipe**: configure pilotos e horários
- **Slots de horário**: cada piloto clica nos horários que quer correr
- **Tabela**: clique em qualquer célula para editar diretamente
- **+ Nova Equipe**: adiciona quantas equipes quiser

## Rodar local

```bash
npm install
npm run dev
```
