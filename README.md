# RandCash - Send Algorand to Anyone via Email

<div align="center">
  <img src="public/randcash.svg" alt="RandCash Logo" width="120" />
  
  [![Built on Algorand](https://img.shields.io/badge/Built%20on-Algorand-00D4AA?style=flat-square&logo=algorand)](https://algorand.com)
  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
  [![React](https://img.shields.io/badge/React-18.3-61DAFB?style=flat-square&logo=react)](https://reactjs.org/)
  [![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
</div>

## 🚀 Overview

RandCash revolutionizes cryptocurrency transfers by allowing anyone to send ALGO (Algorand's native cryptocurrency) using just an email address. Recipients don't need a crypto wallet beforehand - they can claim their funds whenever they're ready.

### 🎯 Key Features

- **📧 Email-based Transfers** - Send ALGO to any email address
- **🔐 Secure Claim Codes** - Cryptographically secure one-time codes
- **📜 Smart Contract Security** - Funds held safely on-chain until claimed
- **↩️ Automatic Refunds** - Unclaimed funds can be refunded after 5 minutes
- **🌐 Network Support** - Works on both TestNet and MainNet
- **📱 Mobile Friendly** - Responsive design works on all devices
- **🔍 Transaction Tracking** - Monitor all your sent transactions

## 🛠️ Tech Stack

- **Frontend**: React + TypeScript + Vite + Tailwind CSS
- **Backend**: Netlify Functions (Serverless)
- **Blockchain**: Algorand + AlgoSDK
- **Smart Contracts**: TEAL v6
- **Wallet**: Pera Wallet Connect
- **Email Service**: Resend API

## 📋 Prerequisites

- Node.js 18+ and npm
- [Pera Wallet](https://perawallet.app/) (for sending/receiving)
- [Netlify CLI](https://docs.netlify.com/cli/get-started/) (for local development)
- Algorand account with ALGO (get free TestNet ALGO from [faucet](https://bank.testnet.algorand.network/))

## 🚀 Quick Start

### 1. Clone the repository
```bash
git clone https://github.com/yourusername/randcash.app.git
cd randcash.app
```

### 2. Install dependencies
```bash
npm install
```

### 3. Set up environment variables
Create a `.env` file in the root directory:
```env
# Algorand Configuration
SEED_MNEMONIC="your 25-word mnemonic phrase here"

# Resend Email Service
RESEND_API_KEY="re_xxxxxxxx"
RESEND_FROM_EMAIL="noreply@yourdomain.com"

# Network Configuration (optional)
ALGORAND_NETWORK="testnet" # or "mainnet"
```

### 4. Run the development server
```bash
npm run dev
```

The app will be available at `http://localhost:8888`

## 🏗️ Project Structure

```
randcash.app/
├── src/                    # React frontend source
│   ├── components/         # React components
│   ├── utils/             # Utility functions
│   └── App.tsx            # Main application component
├── netlify/               # Netlify Functions (serverless backend)
│   └── functions/         
│       └── create-claim.js # Smart contract deployment
├── server/                # Local development server
│   ├── index.js           # Express server
│   └── services/          # Backend services
├── public/                # Static assets
└── CLAUDE.md             # Development instructions
```

## 💻 Development

### Available Scripts

```bash
# Start development server with Netlify Dev
npm run dev

# Build for production
npm run build

# Run linting
npm run lint

# Deploy to Netlify
npm run netlify:deploy
```

### Smart Contract Development

The TEAL smart contract code is located in:
- `/server/index.js` - For local development
- `/netlify/functions/create-claim.js` - For production

⚠️ **Important**: Keep both files synchronized when making contract changes.

## 🔐 How It Works

### For Senders
1. Connect your Pera wallet
2. Enter recipient's email and amount
3. Sign the transaction
4. Claim code is generated and emailed automatically

### For Recipients
1. Receive email with claim code
2. Visit RandCash and go to "Claim" tab
3. Connect or create a Pera wallet
4. Enter claim code and receive funds

### Security Features
- Claim codes are SHA-256 hashed on-chain
- One-time use only
- Funds locked in smart contracts
- Automatic refund protection
- All transactions verifiable on-chain

## 🌐 Deployment

### Deploy to Netlify

1. Fork this repository
2. Connect to Netlify via GitHub
3. Set environment variables in Netlify dashboard
4. Deploy!

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/yourusername/randcash.app)

## 🧪 Testing

### TestNet Testing
1. Get free TestNet ALGO from the [dispenser](https://bank.testnet.algorand.network/)
2. Use TestNet in the app settings
3. Test sending and claiming without real funds

### Smart Contract Testing
The smart contracts support three operations:
- `claim` - Verify and transfer funds
- `refund` - Return unclaimed funds after timeout
- `delete` - Clean up empty contracts

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

1. Fork the project
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built on [Algorand](https://algorand.com/) blockchain
- Uses [Pera Wallet](https://perawallet.app/) for wallet connectivity
- Email service powered by [Resend](https://resend.com/)
- Hosted on [Netlify](https://netlify.com/)

## 📧 Contact

Questions? Issues? Feel free to:
- Open an [issue](https://github.com/yourusername/randcash.app/issues)
- Start a [discussion](https://github.com/yourusername/randcash.app/discussions)

---

<div align="center">
  Made with ❤️ on Algorand
</div>