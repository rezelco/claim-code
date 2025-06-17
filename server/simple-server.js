// Simplified server for testing
import express from 'express';
import cors from 'cors';

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Simple health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    message: 'Backend server is running successfully!'
  });
});

// Simple create-claim endpoint for testing
app.post('/api/create-claim', (req, res) => {
  console.log('📨 Received create-claim request:', req.body);
  
  const { amount, recipient, message, senderAddress } = req.body;
  
  // Basic validation
  if (!amount || !recipient || !senderAddress) {
    return res.status(400).json({ 
      error: 'Missing required fields: amount, recipient, senderAddress' 
    });
  }
  
  // Return a simple success response
  res.json({
    success: true,
    message: 'Claim created successfully (test mode)',
    data: {
      claimCode: 'TEST-CLAIM-CODE-12345',
      transactionId: 'test-transaction-id',
      amount: amount,
      recipient: recipient,
      message: message || '',
      timestamp: new Date().toISOString()
    }
  });
});

// Catch-all for undefined routes
app.use('*', (req, res) => {
  res.status(404).json({ 
    error: 'Endpoint not found',
    path: req.originalUrl,
    method: req.method
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Simple test server running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/api/health`);
  console.log(`📍 Create claim: http://localhost:${PORT}/api/create-claim`);
});