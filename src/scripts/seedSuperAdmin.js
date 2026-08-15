import 'dotenv/config';

import User from '../models/User.js';
import { dataProviderName } from '../config/providers.js';

function required(name) {
  const value = String(process.env[name] || '').trim();

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

async function run() {
  if (dataProviderName() !== 'google') {
    throw new Error(
      'seed:super-admin now requires DATA_PROVIDER=google',
    );
  }

  const email = required('SUPER_ADMIN_EMAIL').toLowerCase();
  const password = required('SUPER_ADMIN_PASSWORD');
  const name = required('SUPER_ADMIN_NAME');

  const shouldResetPassword =
    String(process.env.SUPER_ADMIN_FORCE_PASSWORD_RESET || '')
      .toLowerCase() === 'true';

  const existing = await User.findOne({ email });

  if (!existing) {
    await User.create({
      name,
      email,
      password,
      role: 'admin',
      status: 'active',
      accountStatus: 'active',
      isSuperAdmin: true,
      isProtected: true,
      protectedReason: 'Primary MSPixelPulse super admin account',
      jobTitle: 'Founder / Super Admin',
      timezone: 'America/Toronto',
      preferredContactMethod: 'portal',
      bio: 'Primary MSPixelPulse account for protected production administration.',
      specialties: [
        'Agency operations',
        'Client portals',
        'Website delivery',
      ],
      technologies: [
        'React',
        'Node.js',
        'Google Sheets',
        'Google Drive',
      ],
    });

    console.log(JSON.stringify({
      ok: true,
      provider: 'google',
      action: 'created',
      email,
      passwordReset: true,
    }, null, 2));

    return;
  }

  existing.name = name;
  existing.role = 'admin';
  existing.status = 'active';
  existing.accountStatus = 'active';
  existing.isSuperAdmin = true;
  existing.isProtected = true;
  existing.protectedReason = 'Primary MSPixelPulse super admin account';
  existing.jobTitle = existing.jobTitle || 'Founder / Super Admin';
  existing.timezone = existing.timezone || 'America/Toronto';
  existing.preferredContactMethod =
    existing.preferredContactMethod || 'portal';

  existing.bio =
    existing.bio ||
    'Primary MSPixelPulse account for protected production administration.';

  existing.specialties =
    existing.specialties?.length
      ? existing.specialties
      : [
          'Agency operations',
          'Client portals',
          'Website delivery',
        ];

  existing.technologies =
    existing.technologies?.length
      ? existing.technologies
      : [
          'React',
          'Node.js',
          'Google Sheets',
          'Google Drive',
        ];

  if (shouldResetPassword) {
    existing.password = password;
  }

  await existing.save();

  console.log(JSON.stringify({
    ok: true,
    provider: 'google',
    action: 'updated',
    email,
    passwordReset: shouldResetPassword,
  }, null, 2));
}

run().catch((error) => {
  console.error(
    error?.message || 'Super admin seed failed',
  );

  process.exitCode = 1;
});
