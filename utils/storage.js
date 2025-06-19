import fs from 'fs';
import path from 'path';

// Simple file-based storage for serverless environment
// Note: In serverless environments, /tmp storage is ephemeral and may not persist between function calls
const STORAGE_DIR = '/tmp/randcash-claims';

// In-memory fallback for development
const memoryStorage = new Map();

// Ensure storage directory exists
function ensureStorageDir() {
  if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
  }
}

// Store claim information
export function storeClaim(claimCode, claimData) {
  const data = {
    ...claimData,
    createdAt: claimData.createdAt || new Date(),
    claimed: claimData.claimed || false
  };
  
  // Store in memory first
  memoryStorage.set(claimCode, data);
  
  // Try to store in file system as backup
  try {
    ensureStorageDir();
    const filePath = path.join(STORAGE_DIR, `${claimCode}.json`);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log(`💾 Stored claim ${claimCode} in both memory and file system`);
  } catch (error) {
    console.log(`💾 Stored claim ${claimCode} in memory only (file system unavailable):`, error.message);
  }
}

// Get claim information
export function getClaim(claimCode) {
  // Check memory first
  if (memoryStorage.has(claimCode)) {
    console.log(`📖 Retrieved claim ${claimCode} from memory`);
    return memoryStorage.get(claimCode);
  }
  
  // Fallback to file system
  try {
    ensureStorageDir();
    const filePath = path.join(STORAGE_DIR, `${claimCode}.json`);
    
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      const claim = JSON.parse(data);
      // Store back in memory for faster access
      memoryStorage.set(claimCode, claim);
      console.log(`📖 Retrieved claim ${claimCode} from file system`);
      return claim;
    }
  } catch (error) {
    console.error('Error reading claim file:', error);
  }
  
  console.log(`❌ Claim ${claimCode} not found in memory or file system`);
  return null;
}

// Mark claim as used
export function markClaimAsUsed(claimCode) {
  const claim = getClaim(claimCode);
  if (claim) {
    claim.claimed = true;
    claim.claimedAt = new Date();
    storeClaim(claimCode, claim);
    console.log(`✅ Marked claim ${claimCode} as used`);
  } else {
    console.log(`⚠️ Could not find claim ${claimCode} to mark as used`);
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