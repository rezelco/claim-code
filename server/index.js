import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize Twilio client only if valid credentials are provided
let twilioClient = null;
const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;

// Check if Twilio credentials are valid (not placeholder values)
const isValidTwilioConfig = 
  twilioAccountSid && 
  twilioAuthToken && 
  twilioPhoneNumber &&
  twilioAccountSid.startsWith('AC') &&
  twilioAccountSid !== 'your_twilio_account_sid' &&
  twilioAuthToken !== 'your_twilio_auth_token' &&
  twilioPhoneNumber !== 'your_twilio_phone_number';

if (isValidTwilioConfig) {
  try {
    const { default: twilio } = await import('twilio');
    twilioClient = twilio(twilioAccountSid, twilioAuthToken);
    console.log('✅ Twilio client initialized successfully');
  } catch (error) {
    console.warn('⚠️ Failed to initialize Twilio client:', error.message);
    console.log('📱 SMS notifications will be simulated');
  }
} else {
  console.log('📱 Twilio not configured - SMS notifications will be simulated');
}

// Initialize SendGrid client only if valid credentials are provided
let sendGridClient = null;
const sendGridApiKey = process.env.SENDGRID_API_KEY;
const sendGridFromEmail = process.env.SENDGRID_FROM_EMAIL;

const isValidSendGridConfig = 
  sendGridApiKey && 
  sendGridFromEmail &&
  sendGridApiKey !== 'your_sendgrid_api_key' &&
  sendGridFromEmail !== 'noreply@randcash.app';

if (isValidSendGridConfig) {
  try {
    const sgMail = await import('@sendgrid/mail');
    sgMail.default.setApiKey(sendGridApiKey);
    sendGridClient = sgMail.default;
    console.log('✅ SendGrid client initialized successfully');
  } catch (error) {
    console.warn('⚠️ Failed to initialize SendGrid client:', error.message);
    console.log('📧 Email notifications will be simulated');
  }
} else {
  console.log('📧 SendGrid not configured - Email notifications will be simulated');
}

// Utility function to send SMS
async function sendSMS(to, message) {
  if (twilioClient) {
    try {
      const result = await twilioClient.messages.create({
        body: message,
        from: twilioPhoneNumber,
        to: to
      });
      return { success: true, messageId: result.sid };
    } catch (error) {
      console.error('SMS sending failed:', error);
      return { success: false, error: error.message };
    }
  } else {
    // Simulate SMS sending
    console.log(`📱 [SIMULATED SMS] To: ${to}, Message: ${message}`);
    return { success: true, messageId: 'simulated_' + Date.now(), simulated: true };
  }
}

// Utility function to send Email
async function sendEmail(to, subject, text, html) {
  if (sendGridClient) {
    try {
      const msg = {
        to: to,
        from: sendGridFromEmail,
        subject: subject,
        text: text,
        html: html,
      };
      const result = await sendGridClient.send(msg);
      return { success: true, messageId: result[0].headers['x-message-id'] };
    } catch (error) {
      console.error('Email sending failed:', error);
      return { success: false, error: error.message };
    }
  } else {
    // Simulate email sending
    console.log(`📧 [SIMULATED EMAIL] To: ${to}, Subject: ${subject}, Text: ${text}`);
    return { success: true, messageId: 'simulated_' + Date.now(), simulated: true };
  }
}

// API Routes

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    services: {
      twilio: twilioClient ? 'connected' : 'simulated',
      sendgrid: sendGridClient ? 'connected' : 'simulated'
    }
  });
});

// Send notification endpoint
app.post('/api/send-notification', async (req, res) => {
  try {
    const { type, to, message, subject, html } = req.body;

    if (!type || !to || !message) {
      return res.status(400).json({ 
        error: 'Missing required fields: type, to, message' 
      });
    }

    let result;

    if (type === 'sms') {
      result = await sendSMS(to, message);
    } else if (type === 'email') {
      result = await sendEmail(to, subject || 'Notification', message, html);
    } else {
      return res.status(400).json({ 
        error: 'Invalid notification type. Use "sms" or "email"' 
      });
    }

    res.json(result);
  } catch (error) {
    console.error('Notification sending error:', error);
    res.status(500).json({ 
      error: 'Failed to send notification',
      details: error.message 
    });
  }
});

// Wallet balance endpoint (mock)
app.get('/api/wallet/:address/balance', async (req, res) => {
  try {
    const { address } = req.params;
    const { network = 'ethereum' } = req.query;

    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 500));

    // Mock balance data
    const mockBalance = {
      address,
      network,
      balance: (Math.random() * 10).toFixed(4),
      currency: network === 'ethereum' ? 'ETH' : 'BTC',
      usdValue: (Math.random() * 25000).toFixed(2),
      lastUpdated: new Date().toISOString()
    };

    res.json(mockBalance);
  } catch (error) {
    console.error('Balance fetch error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch balance',
      details: error.message 
    });
  }
});

// Transaction history endpoint (mock)
app.get('/api/wallet/:address/transactions', async (req, res) => {
  try {
    const { address } = req.params;
    const { network = 'ethereum', limit = 10 } = req.query;

    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 800));

    // Mock transaction data
    const mockTransactions = Array.from({ length: parseInt(limit) }, (_, i) => ({
      id: `tx_${Date.now()}_${i}`,
      hash: `0x${Math.random().toString(16).substr(2, 64)}`,
      from: i % 2 === 0 ? address : `0x${Math.random().toString(16).substr(2, 40)}`,
      to: i % 2 === 1 ? address : `0x${Math.random().toString(16).substr(2, 40)}`,
      value: (Math.random() * 5).toFixed(4),
      currency: network === 'ethereum' ? 'ETH' : 'BTC',
      timestamp: new Date(Date.now() - i * 3600000).toISOString(),
      status: Math.random() > 0.1 ? 'confirmed' : 'pending',
      network
    }));

    res.json({
      address,
      network,
      transactions: mockTransactions,
      total: mockTransactions.length
    });
  } catch (error) {
    console.error('Transaction fetch error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch transactions',
      details: error.message 
    });
  }
});

// Price data endpoint (mock)
app.get('/api/price/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;

    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 300));

    // Mock price data
    const basePrice = symbol.toLowerCase() === 'eth' ? 2500 : 45000;
    const change = (Math.random() - 0.5) * 0.1; // ±5% change
    const currentPrice = basePrice * (1 + change);

    const mockPriceData = {
      symbol: symbol.toUpperCase(),
      price: currentPrice.toFixed(2),
      change24h: (change * 100).toFixed(2),
      changePercent24h: change > 0 ? `+${(change * 100).toFixed(2)}%` : `${(change * 100).toFixed(2)}%`,
      lastUpdated: new Date().toISOString()
    };

    res.json(mockPriceData);
  } catch (error) {
    console.error('Price fetch error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch price data',
      details: error.message 
    });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ 
    error: 'Internal server error',
    details: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Endpoint not found',
    path: req.path 
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
});

export default app;