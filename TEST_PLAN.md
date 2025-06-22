# RandCash Comprehensive Test Plan

## Executive Summary

This test plan covers all features of the RandCash application, a decentralized cryptocurrency sending platform built on Algorand blockchain. The application allows users to send ALGO via claim codes, manage contracts, and handle refunds.

## Test Environment

### Networks
- **TestNet**: Primary testing environment (no real funds)
- **MainNet**: Production environment (real ALGO)

### Prerequisites
- Pera Wallet installed and configured
- TestNet account with test ALGO
- Modern web browser (Chrome, Firefox, Safari, Edge)
- Internet connection

### Test Data
- **TestNet Dispenser**: https://testnet.algoexplorer.io/dispenser
- **Test Accounts**: Create multiple test accounts in Pera Wallet
- **Test Amounts**: 0.1 - 10 ALGO

## Feature Test Cases

### 1. Send Money Feature

#### 1.1 Wallet Connection
- [ ] **Test**: Click "Connect" button without Pera Wallet installed
  - **Expected**: Error message about missing wallet
- [ ] **Test**: Click "Connect" with Pera Wallet installed
  - **Expected**: Wallet connection prompt appears
- [ ] **Test**: Approve connection in Pera Wallet
  - **Expected**: Wallet address displayed in header
- [ ] **Test**: Click "Disconnect" button
  - **Expected**: Wallet disconnected, button changes to "Connect"

#### 1.2 Send Form Validation
- [ ] **Test**: Try to send with empty amount
  - **Expected**: "Please enter a valid amount" error
- [ ] **Test**: Enter amount < 0.1 ALGO
  - **Expected**: "Minimum amount is 0.1 ALGO" error
- [ ] **Test**: Enter amount > 10 ALGO on MainNet
  - **Expected**: "Maximum amount on MainNet is 10 ALGO" error
- [ ] **Test**: Leave email empty and click Send
  - **Expected**: Confirmation dialog "No email address provided"
- [ ] **Test**: Enter invalid email format
  - **Expected**: "Please provide a valid email address" error
- [ ] **Test**: Try to send without wallet connected
  - **Expected**: "Please connect your wallet first" error

#### 1.3 Send Transaction Flow
- [ ] **Test**: Fill valid amount (0.5 ALGO) and email
  - **Expected**: Form accepts input
- [ ] **Test**: Add optional message
  - **Expected**: Message field accepts text
- [ ] **Test**: Click "Send Funds"
  - **Expected**: "Please sign the transaction" message, wallet opens
- [ ] **Test**: Approve transaction in wallet
  - **Expected**: "Submitting transaction" loading state
- [ ] **Test**: Wait for confirmation
  - **Expected**: Success screen with claim code

#### 1.4 Success Screen
- [ ] **Test**: Verify success screen displays
  - **Expected**: "Money Sent Successfully!" header
- [ ] **Test**: Check claim code visibility
  - **Expected**: Claim code hidden by default with dots
- [ ] **Test**: Click "Show" button
  - **Expected**: Full claim code displayed
- [ ] **Test**: Click "Copy" button
  - **Expected**: Claim code copied, button shows "Copied!"
- [ ] **Test**: Verify transaction details
  - **Expected**: Amount, recipient, transaction IDs displayed
- [ ] **Test**: Click "View on Explorer" link
  - **Expected**: Opens AlgoExplorer in new tab
- [ ] **Test**: Click "Send Another Payment"
  - **Expected**: Returns to send form

### 2. Claim Money Feature

#### 2.1 Claim Form
- [ ] **Test**: Navigate to Claim tab
  - **Expected**: Claim form displayed
- [ ] **Test**: Try to claim without entering code
  - **Expected**: Error message
- [ ] **Test**: Enter invalid claim code format
  - **Expected**: "Invalid claim code format" error
- [ ] **Test**: Enter expired/used claim code
  - **Expected**: Appropriate error message

#### 2.2 Claim Transaction
- [ ] **Test**: Enter valid claim code
  - **Expected**: Code accepted
- [ ] **Test**: Click "Claim Funds" without wallet
  - **Expected**: Prompts to connect wallet
- [ ] **Test**: Click "Claim Funds" with wallet
  - **Expected**: Transaction signing prompt
- [ ] **Test**: Sign transaction
  - **Expected**: "Claiming funds" loading state
- [ ] **Test**: Wait for confirmation
  - **Expected**: Success screen shows claimed amount

#### 2.3 Claim Success
- [ ] **Test**: Verify success message
  - **Expected**: "🎉 Success! Funds have been sent to your wallet"
- [ ] **Test**: Check claimed amount display
  - **Expected**: Shows correct ALGO amount
- [ ] **Test**: Verify transaction details
  - **Expected**: Transaction ID with explorer link
- [ ] **Test**: Click "Claim Another"
  - **Expected**: Returns to claim form

### 3. Contract Management

#### 3.1 View Contracts
- [ ] **Test**: Navigate to Contracts tab without wallet
  - **Expected**: Prompts to connect wallet
- [ ] **Test**: Connect wallet and view contracts
  - **Expected**: Contract list loads
- [ ] **Test**: Verify contract categories
  - **Expected**: Active, Refunded, Claimed sections

#### 3.2 Contract Display
- [ ] **Test**: Check Active contracts display
  - **Expected**: Shows unclaimed contracts with amounts
- [ ] **Test**: Verify refund timer
  - **Expected**: Shows "Refund in X min" for new contracts
- [ ] **Test**: Check contract details
  - **Expected**: App ID, amount, time ago, status

#### 3.3 Refund Functionality
- [ ] **Test**: Try to refund before 5 minutes
  - **Expected**: Button disabled, shows time remaining
- [ ] **Test**: Wait 5 minutes and try refund
  - **Expected**: Refund button enabled
- [ ] **Test**: Click refund button
  - **Expected**: Confirmation dialog appears
- [ ] **Test**: Confirm refund
  - **Expected**: Transaction signing prompt
- [ ] **Test**: Complete refund
  - **Expected**: Toast notification, contract moves to Refunded

#### 3.4 Delete Functionality
- [ ] **Test**: Find claimed contract with delete option
  - **Expected**: "Delete to reclaim 0.1 ALGO" button
- [ ] **Test**: Click delete button
  - **Expected**: Confirmation dialog
- [ ] **Test**: Confirm deletion
  - **Expected**: Transaction signing prompt
- [ ] **Test**: Complete deletion
  - **Expected**: Contract removed, 0.1 ALGO reclaimed

#### 3.5 Contract Summary
- [ ] **Test**: Check summary totals
  - **Expected**: Shows total refundable amount
- [ ] **Test**: Verify locked balance
  - **Expected**: Shows total locked in contracts
- [ ] **Test**: Check reclaimable amount
  - **Expected**: Shows deletable contract totals

### 4. Network Switching

#### 4.1 Network Selector
- [ ] **Test**: Click network selector
  - **Expected**: Shows TestNet/MainNet options
- [ ] **Test**: Switch from TestNet to MainNet
  - **Expected**: Network changes, wallet reconnect prompt
- [ ] **Test**: Verify MainNet restrictions
  - **Expected**: 10 ALGO maximum, warning message

#### 4.2 Network-Specific Features
- [ ] **Test**: Check explorer links on TestNet
  - **Expected**: Links to TestNet explorer
- [ ] **Test**: Check explorer links on MainNet
  - **Expected**: Links to MainNet explorer
- [ ] **Test**: Verify network indicator
  - **Expected**: Shows current network clearly

### 5. UI/UX Features

#### 5.1 Responsive Design
- [ ] **Test**: View on mobile device
  - **Expected**: Layout adapts, all features accessible
- [ ] **Test**: View on tablet
  - **Expected**: Appropriate layout
- [ ] **Test**: View on desktop
  - **Expected**: Full layout with sidebars

#### 5.2 Loading States
- [ ] **Test**: Observe transaction loading
  - **Expected**: Spinner with descriptive text
- [ ] **Test**: Check contract loading
  - **Expected**: Loading indicator while fetching

#### 5.3 Error Handling
- [ ] **Test**: Disconnect network during transaction
  - **Expected**: Appropriate error message
- [ ] **Test**: Cancel wallet transaction
  - **Expected**: Returns to form state
- [ ] **Test**: Server error simulation
  - **Expected**: User-friendly error message

#### 5.4 Toast Notifications
- [ ] **Test**: Complete successful action
  - **Expected**: Green success toast (8 seconds)
- [ ] **Test**: Trigger error condition
  - **Expected**: Red error toast
- [ ] **Test**: Multiple toasts
  - **Expected**: Stack properly, dismiss individually

### 6. Edge Cases

#### 6.1 Boundary Conditions
- [ ] **Test**: Send exactly 0.1 ALGO
  - **Expected**: Transaction succeeds
- [ ] **Test**: Send exactly 10 ALGO on MainNet
  - **Expected**: Transaction succeeds
- [ ] **Test**: Very long email address
  - **Expected**: Handled gracefully
- [ ] **Test**: Very long message
  - **Expected**: Text area expands appropriately

#### 6.2 Concurrent Operations
- [ ] **Test**: Open app in multiple tabs
  - **Expected**: Each tab functions independently
- [ ] **Test**: Switch tabs during transaction
  - **Expected**: Transaction completes properly
- [ ] **Test**: Multiple refunds quickly
  - **Expected**: Each processed correctly

#### 6.3 Legacy Contracts
- [ ] **Test**: View old contracts without timestamps
  - **Expected**: Shows "some time ago"
- [ ] **Test**: Refund legacy contract
  - **Expected**: Works if supported by contract
- [ ] **Test**: Delete legacy contract
  - **Expected**: Error if not supported

### 7. Security Tests

#### 7.1 Input Validation
- [ ] **Test**: SQL injection in email field
  - **Expected**: Input sanitized
- [ ] **Test**: XSS attempt in message field
  - **Expected**: Input escaped properly
- [ ] **Test**: Invalid claim code injection
  - **Expected**: Rejected safely

#### 7.2 Transaction Security
- [ ] **Test**: Modify transaction in flight
  - **Expected**: Blockchain rejects
- [ ] **Test**: Replay transaction attempt
  - **Expected**: Fails due to unique IDs
- [ ] **Test**: Wrong wallet signature
  - **Expected**: Transaction rejected

## Test Execution

### Priority Levels
1. **Critical**: Wallet connection, sending, claiming
2. **High**: Contract management, refunds
3. **Medium**: UI features, network switching
4. **Low**: Edge cases, legacy support

### Test Schedule
1. **Phase 1**: Core functionality (Send, Claim)
2. **Phase 2**: Contract management
3. **Phase 3**: UI/UX and edge cases
4. **Phase 4**: Security and performance

## Bug Reporting

### Template
```
**Bug Title**: [Feature] - Brief description
**Severity**: Critical/High/Medium/Low
**Environment**: TestNet/MainNet, Browser, Wallet version
**Steps to Reproduce**:
1. Step one
2. Step two
**Expected Result**: What should happen
**Actual Result**: What actually happened
**Screenshots**: If applicable
```

## Sign-off Criteria

- [ ] All critical tests pass
- [ ] No high-severity bugs remain
- [ ] Performance acceptable (< 3s transaction time)
- [ ] UI renders correctly on all target devices
- [ ] Security tests pass
- [ ] Documentation updated

## Appendices

### A. Test Wallet Addresses
- Record test wallet addresses used
- Note balances before/after tests

### B. Test Transactions
- Log transaction IDs for verification
- Keep claim codes for reference

### C. Known Issues
- Document any accepted limitations
- Track workarounds for known issues

---

**Last Updated**: [Current Date]
**Version**: 1.0
**Approved By**: [Name]