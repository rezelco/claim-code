import React, { useState, useEffect } from 'react';
import { ArrowLeft, BookOpen, Wallet, Send, Gift, FileText, Globe, HelpCircle, Shield, ChevronRight, Menu, X } from 'lucide-react';

interface GuideProps {
  onBack: () => void;
}

const Guide: React.FC<GuideProps> = ({ onBack }) => {
  const [activeSection, setActiveSection] = useState('what-is-randcash');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const sections = [
    { id: 'what-is-randcash', title: 'What is RandCash?', icon: BookOpen },
    { id: 'setting-up-pera', title: 'Setting Up Pera Wallet', icon: Wallet },
    { id: 'connecting-wallet', title: 'Connecting Your Wallet', icon: Wallet },
    { id: 'sending-funds', title: 'Sending Funds', icon: Send },
    { id: 'claiming-funds', title: 'Claiming Funds', icon: Gift },
    { id: 'managing-contracts', title: 'Managing Contracts', icon: FileText },
    { id: 'network-selection', title: 'Network Selection', icon: Globe },
    { id: 'troubleshooting', title: 'Troubleshooting', icon: HelpCircle },
    { id: 'security-tips', title: 'Security Tips', icon: Shield }
  ];

  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.scrollY + 100;
      
      for (const section of sections) {
        const element = document.getElementById(section.id);
        if (element) {
          const { offsetTop, offsetHeight } = element;
          if (scrollPosition >= offsetTop && scrollPosition < offsetTop + offsetHeight) {
            setActiveSection(section.id);
            break;
          }
        }
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setSidebarOpen(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-purple-800 to-purple-900">
      {/* Header */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-purple-900/20 backdrop-blur-xl border-b border-purple-500/20">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <button
            onClick={onBack}
            className="flex items-center gap-2 px-4 py-2 bg-purple-800/30 hover:bg-purple-800/50 text-white rounded-xl backdrop-blur-sm transition-all"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to App
          </button>
          
          <h1 className="text-2xl font-bold text-white">RandCash Guide</h1>
          
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="lg:hidden p-2 bg-purple-800/30 hover:bg-purple-800/50 text-white rounded-xl backdrop-blur-sm transition-all"
          >
            {sidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      <div className="flex pt-20">
        {/* Sidebar Navigation */}
        <div className={`fixed lg:sticky top-20 left-0 h-[calc(100vh-5rem)] w-80 bg-purple-900/20 backdrop-blur-xl border-r border-purple-500/20 overflow-y-auto transition-transform duration-300 z-40 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}>
          <nav className="p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Table of Contents</h2>
            <ul className="space-y-2">
              {sections.map((section) => {
                const Icon = section.icon;
                return (
                  <li key={section.id}>
                    <button
                      onClick={() => scrollToSection(section.id)}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-left ${
                        activeSection === section.id
                          ? 'bg-purple-800/30 text-white border border-cyan-400/50'
                          : 'text-purple-200 hover:bg-purple-800/20 hover:text-white'
                      }`}
                    >
                      <Icon className="w-5 h-5 flex-shrink-0" />
                      <span className="text-sm font-medium">{section.title}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>

        {/* Main Content */}
        <div className="flex-1 lg:ml-0 px-4 lg:px-8 pb-20">
          <div className="max-w-4xl mx-auto">
            {/* What is RandCash */}
            <section id="what-is-randcash" className="mb-16">
              <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-8 shadow-2xl border border-purple-500/20">
                <h2 className="text-3xl font-bold text-white mb-6 flex items-center gap-3">
                  <BookOpen className="w-8 h-8 text-cyan-400" />
                  What is RandCash?
                </h2>
                <p className="text-purple-100 mb-6 leading-relaxed">
                  RandCash is a decentralized application (dApp) that allows you to send Algorand (ALGO) cryptocurrency to anyone using just their email address. Recipients don't need a wallet to receive funds - they get a claim code via email and can claim the funds whenever they're ready.
                </p>
                <div className="bg-purple-800/20 rounded-xl p-6 border border-purple-500/20">
                  <h3 className="text-xl font-semibold text-white mb-4">Key Features:</h3>
                  <ul className="space-y-3 text-purple-100">
                    <li className="flex items-start gap-3">
                      <ChevronRight className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" />
                      <span>Send ALGO to email addresses</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <ChevronRight className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" />
                      <span>Recipients receive secure claim codes</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <ChevronRight className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" />
                      <span>Funds are held in smart contracts until claimed</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <ChevronRight className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" />
                      <span>Refund unclaimed funds anytime</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <ChevronRight className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" />
                      <span>Works on both TestNet and MainNet</span>
                    </li>
                  </ul>
                </div>
              </div>
            </section>

            {/* Setting Up Pera Wallet */}
            <section id="setting-up-pera" className="mb-16">
              <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-8 shadow-2xl border border-purple-500/20">
                <h2 className="text-3xl font-bold text-white mb-6 flex items-center gap-3">
                  <Wallet className="w-8 h-8 text-cyan-400" />
                  Setting Up Pera Wallet
                </h2>
                
                <div className="mb-8">
                  <h3 className="text-xl font-semibold text-white mb-4">Mobile Setup (Recommended)</h3>
                  <ol className="space-y-4 text-purple-100">
                    <li>
                      <strong className="text-white">1. Download Pera Wallet</strong>
                      <ul className="mt-2 ml-6 space-y-1">
                        <li>• iOS: Search "Pera Wallet" in App Store</li>
                        <li>• Android: Search "Pera Wallet" in Google Play Store</li>
                      </ul>
                    </li>
                    <li>
                      <strong className="text-white">2. Create a New Wallet</strong>
                      <ul className="mt-2 ml-6 space-y-1">
                        <li>• Open the app and tap "Create New Account"</li>
                        <li>• Write down your 25-word recovery passphrase</li>
                        <li>• Store the passphrase somewhere safe</li>
                        <li>• Verify the passphrase</li>
                        <li>• Set a 6-digit PIN</li>
                      </ul>
                    </li>
                    <li>
                      <strong className="text-white">3. Fund Your Wallet</strong>
                      <ul className="mt-2 ml-6 space-y-1">
                        <li>• For TestNet: Use the <a href="https://bank.testnet.algorand.network/" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:text-cyan-300 underline">Algorand TestNet Dispenser</a></li>
                        <li>• For MainNet: Purchase ALGO from an exchange</li>
                      </ul>
                    </li>
                  </ol>
                </div>

                <div className="bg-purple-800/20 rounded-xl p-6 border border-purple-500/20">
                  <h3 className="text-xl font-semibold text-white mb-3">Desktop Setup</h3>
                  <p className="text-purple-100">
                    Visit <a href="https://perawallet.app" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:text-cyan-300 underline">perawallet.app</a> and install the browser extension. Follow similar steps to create or import a wallet.
                  </p>
                </div>
              </div>
            </section>

            {/* Connecting Your Wallet */}
            <section id="connecting-wallet" className="mb-16">
              <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-8 shadow-2xl border border-purple-500/20">
                <h2 className="text-3xl font-bold text-white mb-6 flex items-center gap-3">
                  <Wallet className="w-8 h-8 text-cyan-400" />
                  Connecting Your Wallet
                </h2>
                
                <ol className="space-y-6 text-purple-100">
                  <li>
                    <strong className="text-white text-lg">1. Navigate to RandCash</strong>
                    <p className="mt-2">Visit <a href="https://randcash.app" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:text-cyan-300 underline">randcash.app</a></p>
                  </li>
                  <li>
                    <strong className="text-white text-lg">2. Select Network</strong>
                    <ul className="mt-2 ml-6 space-y-1">
                      <li>• Use the network selector in the top right</li>
                      <li>• Choose TestNet for testing (free test ALGO)</li>
                      <li>• Choose MainNet for real transactions</li>
                    </ul>
                  </li>
                  <li>
                    <strong className="text-white text-lg">3. Connect Wallet</strong>
                    <ul className="mt-2 ml-6 space-y-1">
                      <li>• Click the "Connect Wallet" button</li>
                      <li>• Choose "Pera Wallet" from the options</li>
                      <li>• Approve the connection in your wallet</li>
                    </ul>
                  </li>
                </ol>
              </div>
            </section>

            {/* Sending Funds */}
            <section id="sending-funds" className="mb-16">
              <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-8 shadow-2xl border border-purple-500/20">
                <h2 className="text-3xl font-bold text-white mb-6 flex items-center gap-3">
                  <Send className="w-8 h-8 text-cyan-400" />
                  Sending Funds
                </h2>
                
                <ol className="space-y-6 text-purple-100">
                  <li>
                    <strong className="text-white text-lg">1. Access Send Tab</strong>
                    <p className="mt-2">Make sure you're on the "Send" tab (cyan border when active)</p>
                  </li>
                  <li>
                    <strong className="text-white text-lg">2. Enter Details</strong>
                    <ul className="mt-2 ml-6 space-y-1">
                      <li>• <strong>Recipient Email:</strong> Enter the recipient's email address</li>
                      <li>• <strong>Amount (ALGO):</strong> Enter the amount (minimum 0.1 ALGO)</li>
                      <li>• Click "Send Funds"</li>
                    </ul>
                  </li>
                  <li>
                    <strong className="text-white text-lg">3. Sign Transaction</strong>
                    <ul className="mt-2 ml-6 space-y-1">
                      <li>• Review the transaction in Pera Wallet</li>
                      <li>• Enter your PIN or use biometric authentication</li>
                      <li>• Confirm the transaction</li>
                    </ul>
                  </li>
                  <li>
                    <strong className="text-white text-lg">4. Share Claim Code</strong>
                    <ul className="mt-2 ml-6 space-y-1">
                      <li>• You'll see a claim code (format: <code className="bg-purple-800/50 px-2 py-1 rounded">AppID-ClaimCode</code>)</li>
                      <li>• The recipient receives this via email</li>
                      <li>• You can also copy and share it directly</li>
                    </ul>
                  </li>
                </ol>
              </div>
            </section>

            {/* Claiming Funds */}
            <section id="claiming-funds" className="mb-16">
              <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-8 shadow-2xl border border-purple-500/20">
                <h2 className="text-3xl font-bold text-white mb-6 flex items-center gap-3">
                  <Gift className="w-8 h-8 text-cyan-400" />
                  Claiming Funds
                </h2>
                
                <ol className="space-y-6 text-purple-100">
                  <li>
                    <strong className="text-white text-lg">1. Access Claim Tab</strong>
                    <p className="mt-2">Click on the "Claim" tab</p>
                  </li>
                  <li>
                    <strong className="text-white text-lg">2. Enter Claim Code</strong>
                    <ul className="mt-2 ml-6 space-y-1">
                      <li>• Enter the claim code you received</li>
                      <li>• Format: <code className="bg-purple-800/50 px-2 py-1 rounded">12345678-ABCD1234</code></li>
                      <li>• Click "Connect" if not connected</li>
                      <li>• Click "Claim Funds"</li>
                    </ul>
                  </li>
                  <li>
                    <strong className="text-white text-lg">3. Sign Transaction</strong>
                    <ul className="mt-2 ml-6 space-y-1">
                      <li>• Review the claim transaction</li>
                      <li>• Confirm to receive the funds</li>
                      <li>• Funds appear in your wallet immediately</li>
                    </ul>
                  </li>
                </ol>
              </div>
            </section>

            {/* Managing Contracts */}
            <section id="managing-contracts" className="mb-16">
              <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-8 shadow-2xl border border-purple-500/20">
                <h2 className="text-3xl font-bold text-white mb-6 flex items-center gap-3">
                  <FileText className="w-8 h-8 text-cyan-400" />
                  Managing Contracts
                </h2>
                
                <div className="space-y-6 text-purple-100">
                  <div>
                    <h3 className="text-xl font-semibold text-white mb-3">View Contracts</h3>
                    <ul className="ml-6 space-y-1">
                      <li>• Click on the "Contracts" tab</li>
                      <li>• Click "Connect" to connect your wallet</li>
                      <li>• Your sent contracts load automatically</li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="text-xl font-semibold text-white mb-3">Contract Details</h3>
                    <p className="mb-2">Each contract shows:</p>
                    <ul className="ml-6 space-y-1">
                      <li>• <strong>App ID:</strong> Smart contract identifier</li>
                      <li>• <strong>Status:</strong> Active, Claimed, or Refundable</li>
                      <li>• <strong>Amount:</strong> Original amount sent</li>
                      <li>• <strong>Balance:</strong> Current balance</li>
                      <li>• <strong>Created:</strong> When created</li>
                    </ul>
                  </div>

                  <div className="bg-purple-800/20 rounded-xl p-6 border border-purple-500/20">
                    <h3 className="text-xl font-semibold text-white mb-3">Actions</h3>
                    <ul className="space-y-2">
                      <li>• <strong>Refund:</strong> Get unclaimed funds back</li>
                      <li>• <strong>Delete:</strong> Remove empty contracts</li>
                    </ul>
                  </div>
                </div>
              </div>
            </section>

            {/* Network Selection */}
            <section id="network-selection" className="mb-16">
              <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-8 shadow-2xl border border-purple-500/20">
                <h2 className="text-3xl font-bold text-white mb-6 flex items-center gap-3">
                  <Globe className="w-8 h-8 text-cyan-400" />
                  Network Selection
                </h2>
                
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="bg-purple-800/20 rounded-xl p-6 border border-purple-500/20">
                    <h3 className="text-xl font-semibold text-white mb-3">TestNet</h3>
                    <ul className="space-y-2 text-purple-100">
                      <li>• For testing and learning</li>
                      <li>• Uses test ALGO (no real value)</li>
                      <li>• Get free test ALGO from the <a href="https://bank.testnet.algorand.network/" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:text-cyan-300 underline">dispenser</a></li>
                      <li>• Perfect for trying out the app</li>
                    </ul>
                  </div>

                  <div className="bg-purple-800/20 rounded-xl p-6 border border-purple-500/20">
                    <h3 className="text-xl font-semibold text-white mb-3">MainNet</h3>
                    <ul className="space-y-2 text-purple-100">
                      <li>• For real transactions</li>
                      <li>• Uses real ALGO cryptocurrency</li>
                      <li>• Requires purchasing ALGO</li>
                      <li>• All transactions are permanent</li>
                    </ul>
                  </div>
                </div>

                <div className="mt-6 p-4 bg-cyan-400/10 border border-cyan-400/30 rounded-xl">
                  <p className="text-purple-100">
                    <strong className="text-white">To switch networks:</strong> Click the network selector (top right) and choose your desired network.
                  </p>
                </div>
              </div>
            </section>

            {/* Troubleshooting */}
            <section id="troubleshooting" className="mb-16">
              <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-8 shadow-2xl border border-purple-500/20">
                <h2 className="text-3xl font-bold text-white mb-6 flex items-center gap-3">
                  <HelpCircle className="w-8 h-8 text-cyan-400" />
                  Troubleshooting
                </h2>
                
                <div className="space-y-6">
                  <div className="bg-purple-800/20 rounded-xl p-6 border border-purple-500/20">
                    <h3 className="text-lg font-semibold text-white mb-3">"Wallet not connected" errors</h3>
                    <ul className="space-y-1 text-purple-100 ml-4">
                      <li>• Click any "Connect" button to reconnect</li>
                      <li>• Make sure Pera Wallet app is open</li>
                      <li>• Try refreshing the page</li>
                    </ul>
                  </div>

                  <div className="bg-purple-800/20 rounded-xl p-6 border border-purple-500/20">
                    <h3 className="text-lg font-semibold text-white mb-3">"Insufficient balance" errors</h3>
                    <ul className="space-y-1 text-purple-100 ml-4">
                      <li>• Check you have enough ALGO + fees (≈0.002 ALGO)</li>
                      <li>• On TestNet, get more from the dispenser</li>
                      <li>• On MainNet, purchase more ALGO</li>
                    </ul>
                  </div>

                  <div className="bg-purple-800/20 rounded-xl p-6 border border-purple-500/20">
                    <h3 className="text-lg font-semibold text-white mb-3">"Invalid claim code" errors</h3>
                    <ul className="space-y-1 text-purple-100 ml-4">
                      <li>• Check format: <code className="bg-purple-800/50 px-2 py-1 rounded">12345678-ABCD1234</code></li>
                      <li>• Ensure you're on the same network</li>
                      <li>• Verify the code hasn't been claimed</li>
                    </ul>
                  </div>

                  <div className="bg-purple-800/20 rounded-xl p-6 border border-purple-500/20">
                    <h3 className="text-lg font-semibold text-white mb-3">Best Practices</h3>
                    <ul className="space-y-1 text-purple-100 ml-4">
                      <li>• Always verify the network before sending</li>
                      <li>• Start with TestNet to learn</li>
                      <li>• Keep claim codes secure</li>
                      <li>• Double-check email addresses</li>
                    </ul>
                  </div>
                </div>
              </div>
            </section>

            {/* Security Tips */}
            <section id="security-tips" className="mb-16">
              <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-8 shadow-2xl border border-purple-500/20">
                <h2 className="text-3xl font-bold text-white mb-6 flex items-center gap-3">
                  <Shield className="w-8 h-8 text-cyan-400" />
                  Security Tips
                </h2>
                
                <div className="space-y-4 text-purple-100">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-red-500/20 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-red-400 font-bold">1</span>
                    </div>
                    <div>
                      <strong className="text-white">Never share your wallet's recovery phrase</strong>
                      <p className="text-sm mt-1">This is the key to your funds - keep it secret</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-red-500/20 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-red-400 font-bold">2</span>
                    </div>
                    <div>
                      <strong className="text-white">Verify you're on the correct website</strong>
                      <p className="text-sm mt-1">Always check: randcash.app</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-red-500/20 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-red-400 font-bold">3</span>
                    </div>
                    <div>
                      <strong className="text-white">Use TestNet first</strong>
                      <p className="text-sm mt-1">Practice with test funds before using real ALGO</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-red-500/20 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-red-400 font-bold">4</span>
                    </div>
                    <div>
                      <strong className="text-white">Keep claim codes private</strong>
                      <p className="text-sm mt-1">Only share with intended recipients</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-red-500/20 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-red-400 font-bold">5</span>
                    </div>
                    <div>
                      <strong className="text-white">Always verify transaction details</strong>
                      <p className="text-sm mt-1">Check amounts and addresses before signing</p>
                    </div>
                  </div>
                </div>

                <div className="mt-8 p-6 bg-gradient-to-r from-purple-800/30 to-cyan-800/30 rounded-xl border border-cyan-400/30">
                  <p className="text-center text-white font-semibold">
                    RandCash makes sending crypto as easy as sending an email. No wallet? No problem!
                  </p>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Guide;