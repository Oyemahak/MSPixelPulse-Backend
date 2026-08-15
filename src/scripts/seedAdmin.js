// src/scripts/seedAdmin.js
import 'dotenv/config';
import User from '../models/User.js';
import { dataProviderName } from '../config/providers.js';

const {
  ADMIN_NAME,
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  SEED_ADMIN_NAME = 'Admin User',
  SEED_ADMIN_EMAIL = 'admin@mspixelpulse.local',
  SEED_ADMIN_PASSWORD,
  ADMIN_FORCE_RESET = 'false',
} = process.env;

async function main() {
  if (dataProviderName() !== 'google') throw new Error('seed:admin requires DATA_PROVIDER=google');
  const adminName = ADMIN_NAME || SEED_ADMIN_NAME;
  const adminEmail = String(ADMIN_EMAIL || SEED_ADMIN_EMAIL).trim().toLowerCase();
  const adminPassword = ADMIN_PASSWORD || SEED_ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword) throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD are required');

  let user = await User.findOne({ email: adminEmail }).select('+password');

  if (!user) {
    user = await User.create({
      name: adminName,
      email: adminEmail,
      password: adminPassword, // plain; model will hash
      role: 'admin',
      status: 'active',
      accountStatus: 'active',
    });
    console.log('✅ Admin created:', user.email);
  } else {
    let changed = false;
    if (user.role !== 'admin') { user.role = 'admin'; changed = true; }
    if (user.status !== 'active') { user.status = 'active'; changed = true; }
    if (user.accountStatus !== 'active') { user.accountStatus = 'active'; changed = true; }
    if (adminName && user.name !== adminName) { user.name = adminName; changed = true; }
    if (String(ADMIN_FORCE_RESET).toLowerCase() === 'true') {
      user.password = adminPassword; // plain; pre-save hashes
      changed = true;
      console.log('ℹ️ Password will be reset for:', user.email);
    }
    if (changed) { await user.save(); console.log('✅ Admin updated:', user.email); }
    else { console.log('ℹ️ Admin already up-to-date:', user.email); }
  }
}

main()
  .catch(err => { console.error('❌ Seed error:', err); process.exitCode = 1; });
