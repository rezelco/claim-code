# RandCash

A decentralized application for sending cryptocurrency via claim codes on the Algorand blockchain.

## Features

- Send ALGO to anyone via email using claim codes
- Smart contract-based claiming system with automatic refunds
- Support for Algorand TestNet and MainNet
- Email notifications via Pica/Resend integration
- Seed wallet funding for new users

## Technology Stack

- **Frontend**: React + TypeScript + Vite + Tailwind CSS
- **Backend**: Netlify Functions (serverless)
- **Blockchain**: Algorand (using AlgoSDK)
- **Email**: Pica/Resend API
- **Deployment**: Netlify

## Development Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd randcash
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Configuration**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and configure:
   - `PICA_SECRET_KEY`: Your Pica API secret key
   - `PICA_RESEND_CONNECTION_KEY`: Your Pica Resend connection key
   - `PICA_FROM_EMAIL`: Email address for sending notifications
   - `SEED_MNEMONIC`: 25-word mnemonic for seed wallet (optional)

4. **Development with Netlify Functions**
   ```bash
   npm run netlify:dev
   ```
   
   This starts:
   - Vite dev server on port 5173
   - Netlify dev server on port 3000
   - All serverless functions available at `/api/*`

5. **Alternative Development (Legacy)**
   ```bash
   npm run dev:full
   ```
   
   This starts the old Express server and Vite concurrently.

## Deployment

### Netlify Deployment

1. **Build the application**
   ```bash
   npm run build
   ```

2. **Deploy to Netlify**
   ```bash
   npm run netlify:deploy
   ```

3. **Environment Variables**
   Configure the following in your Netlify dashboard:
   - `PICA_SECRET_KEY`
   - `PICA_RESEND_CONNECTION_KEY`
   - `PICA_FROM_EMAIL`
   - `SEED_MNEMONIC`
   - `NODE_VERSION=18`

### Manual Netlify Setup

1. Connect your repository to Netlify
2. Set build command: `npm run build`
3. Set publish directory: `dist`
4. Configure environment variables
5. Deploy

## API Endpoints

All endpoints are available as Netlify Functions under `/api/`:

- `POST /api/create-claim` - Create a new claim
- `POST /api/submit-transaction` - Submit signed transaction
- `POST /api/claim-with-code` - Create claim transaction
- `POST /api/submit-claim` - Submit signed claim transaction
- `POST /api/refund-funds` - Create refund transaction
- `POST /api/fund-contract` - Create funding transaction
- `GET /api/health` - Health check
- `GET /api/seed-wallet-address` - Get seed wallet info

## Project Structure

```
├── netlify/functions/          # Serverless functions
├── utils/                      # Shared utilities
├── src/                        # React frontend
├── server/                     # Legacy Express server
├── netlify.toml               # Netlify configuration
└── vite.config.ts             # Vite configuration
```

## Scripts

- `npm run dev` - Start Vite dev server
- `npm run build` - Build for production
- `npm run netlify:dev` - Start Netlify dev environment
- `npm run netlify:deploy` - Deploy to Netlify
- `npm run dev:full` - Start legacy Express + Vite setup

## License

MIT License