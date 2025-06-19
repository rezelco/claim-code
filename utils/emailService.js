import axios from 'axios';
import { NETWORK_CONFIGS } from './algorandClient.js';

// Initialize Pica/Resend email service
const picaSecretKey = process.env.PICA_SECRET_KEY;
const picaConnectionKey = process.env.PICA_RESEND_CONNECTION_KEY;
const picaFromEmail = process.env.PICA_FROM_EMAIL;

const isValidPicaConfig = 
  picaSecretKey && 
  picaConnectionKey && 
  picaFromEmail &&
  picaSecretKey !== 'your_pica_secret_key' &&
  picaConnectionKey !== 'your_pica_resend_connection_key' &&
  picaFromEmail !== 'noreply@randcash.app';

// Send email notification via Pica/Resend
export async function sendEmailNotification(recipient, claimCode, amount, message, network = 'testnet', applicationId = null) {
  const networkName = NETWORK_CONFIGS[network].name;
  
  try {
    if (!isValidPicaConfig) {
      const notificationMessage = `You've received ${amount} ALGO on RandCash (${networkName})! ${message ? `Message: "${message}"` : ''} Use claim code: ${claimCode}${applicationId ? ` and Application ID: ${applicationId}` : ''} to claim your funds.`;
      console.log(`📧 [SIMULATED EMAIL] To: ${recipient}: ${notificationMessage}`);
      return { success: true, method: 'email_simulation' };
    }

    const emailData = {
      from: `RandCash <${picaFromEmail}>`,
      to: recipient,
      subject: `You've received ${amount} ALGO on RandCash (${networkName})!`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <div style="display: inline-block; width: 60px; height: 60px; background: linear-gradient(135deg, #2563eb, #4f46e5); border-radius: 12px; display: flex; align-items: center; justify-content: center; margin-bottom: 16px;">
              <span style="color: white; font-size: 24px;">💸</span>
            </div>
            <h1 style="color: #1f2937; margin: 0; font-size: 28px; font-weight: bold;">You've received ${amount} ALGO!</h1>
          </div>
          
          <div style="background: #f8fafc; border-radius: 12px; padding: 24px; margin: 24px 0;">
            <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
              Someone sent you cryptocurrency using RandCash on Algorand ${networkName}.
            </p>
            ${message ? `
              <div style="background: white; border-radius: 8px; padding: 16px; margin: 16px 0; border-left: 4px solid #2563eb;">
                <p style="color: #6b7280; font-size: 14px; margin: 0 0 4px 0; font-weight: 600;">Message:</p>
                <p style="color: #1f2937; font-size: 16px; margin: 0; font-style: italic;">"${message}"</p>
              </div>
            ` : ''}
          </div>
          
          <div style="background: linear-gradient(135deg, #eff6ff, #dbeafe); border-radius: 12px; padding: 24px; margin: 24px 0; text-align: center;">
            ${applicationId ? `
              <p style="color: #1e40af; font-size: 16px; font-weight: 600; margin: 0 0 12px 0;">Application ID:</p>
              <div style="background: white; border-radius: 8px; padding: 16px; margin: 12px 0; border: 2px solid #7c3aed;">
                <p style="font-family: 'Courier New', monospace; font-size: 24px; font-weight: bold; color: #1f2937; margin: 0; letter-spacing: 2px;">
                  ${applicationId}
                </p>
              </div>
            ` : ''}
            <p style="color: #1e40af; font-size: 16px; font-weight: 600; margin: ${applicationId ? '20px 0 12px 0' : '0 0 12px 0'};">Your Claim Code:</p>
            <div style="background: white; border-radius: 8px; padding: 16px; margin: 12px 0; border: 2px solid #2563eb;">
              <p style="font-family: 'Courier New', monospace; font-size: 24px; font-weight: bold; color: #1f2937; margin: 0; letter-spacing: 2px;">
                ${claimCode}
              </p>
            </div>
            <p style="color: #1e40af; font-size: 14px; margin: 12px 0 0 0;">
              ${applicationId ? 'Keep both codes safe - you\'ll need them to claim your funds!' : 'Keep this code safe - you\'ll need it to claim your funds!'}
            </p>
          </div>
          
          <div style="text-align: center; margin: 32px 0;">
            <a href="https://randcash.app" style="display: inline-block; background: linear-gradient(135deg, #2563eb, #4f46e5); color: white; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 16px;">
              Claim Your Funds →
            </a>
          </div>
          
          <div style="border-top: 1px solid #e5e7eb; padding-top: 20px; margin-top: 32px;">
            <p style="color: #6b7280; font-size: 12px; text-align: center; margin: 0;">
              Network: Algorand ${networkName} • Powered by RandCash
            </p>
          </div>
        </div>
      `,
      text: `You've received ${amount} ALGO on RandCash (${networkName})!

${message ? `Message: "${message}"` : ''}

${applicationId ? `Application ID: ${applicationId}
` : ''}Your claim code: ${claimCode}

Visit RandCash to claim your funds by entering ${applicationId ? 'both codes' : 'this code'} and connecting your wallet.

Network: Algorand ${networkName}`,
      tags: [
        { name: 'service', value: 'randcash' },
        { name: 'type', value: 'claim_notification' },
        { name: 'network', value: network }
      ]
    };

    console.log('📧 Attempting to send email via Pica API...');
    
    const response = await axios.post('https://api.picaos.com/v1/passthrough/email', emailData, {
      headers: {
        'Content-Type': 'application/json',
        'x-pica-secret': picaSecretKey,
        'x-pica-connection-key': picaConnectionKey,
        'x-pica-action-id': 'conn_mod_def::GC4q4JE4I28::x8Elxo0VRMK1X-uH1C3NeA',
      }
    });

    console.log(`✅ Email sent successfully! Status: ${response.status}, ID: ${response.data?.id || 'unknown'}`);
    return { success: true, method: 'email', emailId: response.data?.id };

  } catch (error) {
    console.error('❌ Email sending failed:', error.message);
    
    // Don't fail the entire transaction if notification fails
    return { 
      success: false, 
      error: `Email API error (${error.response?.status || 'network'}): ${error.response?.data?.message || error.message}`, 
      method: 'email' 
    };
  }
}

export { isValidPicaConfig };