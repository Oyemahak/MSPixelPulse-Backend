import 'dotenv/config';
import crypto from 'crypto';

import Project from '../models/Project.js';
import User from '../models/User.js';
import { dataProviderName } from '../config/providers.js';

const DEMO_PROJECT_SLUGS = [
  'bloom-by-maryam-flower-boutique',
  'stephy-pet-grooming-studio',
  'northstar-home-services',
  'ms-pixelpulse-realty-group',
  'ms-pixelpulse-wellness-studio',
  'brightpath-autism-child-development',
];

function generatedPassword() {
  return crypto.randomBytes(32).toString('base64url');
}

function normalizeEmail(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

async function ensureDemoUser(kind, defaults) {
  const email = normalizeEmail(
    process.env[defaults.emailEnv] ||
      defaults.email,
  );

  const configuredPassword = String(
    process.env[defaults.passwordEnv] || '',
  ).trim();

  let user = await User.findOne({
    email,
  });

  const baseProfile = {
    name: defaults.name,
    email,
    role: kind,

    status: 'active',
    accountStatus: 'active',

    phone: defaults.phone,

    companyName:
      defaults.companyName,

    businessName:
      defaults.businessName,

    businessWebsite:
      defaults.businessWebsite,

    industry:
      defaults.industry,

    jobTitle:
      defaults.jobTitle,

    timezone:
      'America/Toronto',

    preferredContactMethod:
      'portal',

    bio:
      defaults.bio,

    specialties:
      defaults.specialties,

    technologies:
      defaults.technologies,

    availability:
      defaults.availability,

    projectContactPreference:
      'Portal updates with email summaries',

    notificationPreferences: {
      portalUpdates: true,
      emailUpdates: true,
      billingAlerts: true,
    },
  };

  if (!user) {
    user = await User.create({
      ...baseProfile,

      password:
        configuredPassword ||
        generatedPassword(),
    });

    return {
      user,
      action: 'created',
      passwordConfigured:
        Boolean(configuredPassword),
    };
  }

  Object.assign(
    user,
    baseProfile,
  );

  if (configuredPassword) {
    user.password =
      configuredPassword;
  }

  await user.save();

  return {
    user,
    action: 'updated',
    passwordConfigured:
      Boolean(configuredPassword),
  };
}

function canAssign(
  currentId,
  demoUserId,
) {
  return (
    !currentId ||
    String(currentId) ===
      String(demoUserId)
  );
}

async function run() {
  if (
    dataProviderName() !==
    'google'
  ) {
    throw new Error(
      'seed:portal-demo now requires DATA_PROVIDER=google',
    );
  }

  const clientResult =
    await ensureDemoUser(
      'client',
      {
        emailEnv:
          'PORTAL_DEMO_CLIENT_EMAIL',

        passwordEnv:
          'PORTAL_DEMO_CLIENT_PASSWORD',

        email:
          'demo.client@mspixelpulse.local',

        name:
          'Demo Client',

        phone:
          '365-883-0338',

        companyName:
          'Sample Local Business',

        businessName:
          'Sample Local Business',

        businessWebsite:
          'https://mspixelpulse.com/projects',

        industry:
          'Small business',

        jobTitle:
          'Owner',

        bio:
          'Demo client profile used to preview the MSPixelPulse portal workflow.',

        specialties: [
          'Service planning',
          'Content review',
          'Launch approval',
        ],

        technologies: [],

        availability:
          'Weekdays, Toronto time',
      },
    );

  const developerResult =
    await ensureDemoUser(
      'developer',
      {
        emailEnv:
          'PORTAL_DEMO_DEVELOPER_EMAIL',

        passwordEnv:
          'PORTAL_DEMO_DEVELOPER_PASSWORD',

        email:
          'demo.developer@mspixelpulse.local',

        name:
          'Demo Developer',

        phone:
          '365-883-0338',

        companyName:
          'MSPixelPulse',

        businessName:
          'MSPixelPulse Delivery Team',

        businessWebsite:
          'https://mspixelpulse.com',

        industry:
          'Web development',

        jobTitle:
          'Frontend Developer',

        bio:
          'Demo developer profile for assigned portfolio and portal project previews.',

        specialties: [
          'Responsive UI',
          'React implementation',
          'Launch QA',
        ],

        technologies: [
          'React',
          'Vite',
          'Node.js',
          'Google Sheets',
          'Google Drive',
        ],

        availability:
          'Project-based delivery windows',
      },
    );

  const assignments = [];

  for (
    const slug of
    DEMO_PROJECT_SLUGS
  ) {
    const project =
      await Project.findOne({
        slug,
      });

    if (!project) {
      assignments.push({
        slug,
        status: 'missing',
      });

      continue;
    }

    if (
      ![
        'demo',
        'concept',
      ].includes(
        project.projectClassification,
      )
    ) {
      assignments.push({
        slug,
        status: 'skipped',
        reason:
          'not demo or concept',
      });

      continue;
    }

    const next = {};

    if (
      canAssign(
        project.client,
        clientResult.user._id,
      )
    ) {
      next.client =
        clientResult.user._id;
    }

    if (
      canAssign(
        project.developer,
        developerResult.user._id,
      )
    ) {
      next.developer =
        developerResult.user._id;
    }

    if (
      !Object.keys(next).length
    ) {
      assignments.push({
        slug,
        status: 'skipped',
        reason:
          'already assigned to non-demo users',
      });

      continue;
    }

    Object.assign(
      project,
      next,
    );

    await project.save();

    assignments.push({
      slug,
      status: 'assigned',
      fields:
        Object.keys(next),
    });
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        provider: 'google',

        users: [
          {
            role: 'client',
            email:
              clientResult.user.email,
            action:
              clientResult.action,
            passwordConfigured:
              clientResult.passwordConfigured,
          },
          {
            role: 'developer',
            email:
              developerResult.user.email,
            action:
              developerResult.action,
            passwordConfigured:
              developerResult.passwordConfigured,
          },
        ],

        assignments,
      },
      null,
      2,
    ),
  );
}

run().catch((error) => {
  console.error(
    error?.message ||
      'Portal demo seed failed',
  );

  process.exitCode = 1;
});