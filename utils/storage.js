import fs from 'fs';
import path from 'path';

// Simple file-based storage for serverless environment
const STORAGE_DIR = '/tmp/randcash-claims';

// Ensure storage directory exists
function ensureStorageDir() {
  if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
  }
}

// Store claim information
export function storeClaim(claimCode, claimData) {
  ensureStorageDir();
  const filePath = path.join(STORAGE_DIR, `${claimCode}.json`);
  const data = {
    ...claimData,
    createdAt: claimData.createdAt || new Date(),
    claimed: claimData.claimed || false
  };
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// Get claim information
export function getClaim(claimCode) {
  ensureStorageDir();
  const filePath = path.join(STORAGE_DIR, `${claimCode}.json`);
  
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(data);
    }
    return null;
  } catch (error) {
    console.error('Error reading claim file:', error);
    return null;
  }
}

// Mark claim as used
export function markClaimAsUsed(claimCode) {
  const claim = getClaim(claimCode);
  if (claim) {
    claim.claimed = true;
    claim.claimedAt = new Date();
    storeClaim(claimCode, claim);
  }
}

// List all claims (for debug endpoints)
export function getAllClaims() {
  ensureStorageDir();
  
  try {
    const files = fs.readdirSync(STORAGE_DIR);
    const claims = [];
    
    for (const file of files) {
      if (file.endsWith('.json')) {
        const claimCode = file.replace('.json', '');
        const claim = getClaim(claimCode);
        if (claim) {
          claims.push({ code: claimCode, ...claim });
        }
      }
    }
    
    return claims;
  } catch (error) {
    console.error('Error listing claims:', error);
    return [];
  }
}

// Clear incomplete claims (for debug)
export function clearIncompleteClaims() {
  const claims = getAllClaims();
  let removed = 0;
  
  for (const claim of claims) {
    if (!claim.applicationId) {
      const filePath = path.join(STORAGE_DIR, `${claim.code}.json`);
      try {
        fs.unlinkSync(filePath);
        removed++;
      } catch (error) {
        console.error('Error removing claim file:', error);
      }
    }
  }
  
  return removed;
}