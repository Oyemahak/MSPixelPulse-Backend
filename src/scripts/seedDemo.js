import 'dotenv/config';
import User from '../models/User.js';
import { dataProviderName } from '../config/providers.js';

const FIXTURES = [
  {
    name: 'Admin',
    email: process.env.SEED_DEMO_ADMIN_EMAIL || 'admin@mspixelpulse.local',
    passwordEnv: 'SEED_DEMO_ADMIN_PASSWORD',
    role: 'admin',
    status: 'active',
  },
  {
    name: 'Client',
    email: process.env.SEED_DEMO_CLIENT_EMAIL || 'client@mspixelpulse.local',
    passwordEnv: 'SEED_DEMO_CLIENT_PASSWORD',
    role: 'client',
    status: 'active',
  },
  {
    name: 'Developer',
    email: process.env.SEED_DEMO_DEVELOPER_EMAIL || 'dev@mspixelpulse.local',
    passwordEnv: 'SEED_DEMO_DEVELOPER_PASSWORD',
    role: 'developer',
    status: 'active',
  },
];

async function main() {
  if (dataProviderName() !== 'google') throw new Error('seed:demo requires DATA_PROVIDER=google');

  const results = [];
  for (const fixture of FIXTURES) {
    const email = fixture.email.toLowerCase();
    const password = process.env[fixture.passwordEnv]?.trim();
    if (!password) throw new Error(`${fixture.passwordEnv} is required`);

    let user = await User.findOne({ email }).select('+password');
    if (!user) {
      user = await User.create({
        name: fixture.name,
        email,
        password,
        role: fixture.role,
        status: fixture.status,
        accountStatus: fixture.status,
      });
      results.push({ email, action: 'created' });
      continue;
    }

    user.name = fixture.name;
    user.role = fixture.role;
    user.status = fixture.status;
    user.accountStatus = fixture.status;
    user.password = password;
    await user.save();
    results.push({ email, action: 'updated' });
  }

  console.log(JSON.stringify({ ok: true, results }, null, 2));
}

main()
  .catch((err) => {
    console.error('Seed demo failed:', err.code || err.message);
    process.exitCode = 1;
  })
