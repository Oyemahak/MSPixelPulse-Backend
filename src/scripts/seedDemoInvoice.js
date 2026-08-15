import 'dotenv/config';

import { dataProviderName } from '../config/providers.js';

import Invoice from '../models/Invoice.js';
import Project from '../models/Project.js';
import User from '../models/User.js';

const DEFAULT_CLIENT_EMAIL =
  'demo.client@mspixelpulse.local';

const DEFAULT_PROJECT_SLUG =
  'bloom-by-maryam-flower-boutique';

const DEMO_INVOICE_NUMBER =
  'MSP-DEMO-0001';

function normalizeEmail(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

async function run() {
  if (dataProviderName() !== 'google') {
    throw new Error(
      'seed:demo-invoice now requires DATA_PROVIDER=google',
    );
  }

  const clientEmail =
    normalizeEmail(
      process.env.PORTAL_DEMO_CLIENT_EMAIL ||
        DEFAULT_CLIENT_EMAIL,
    );

  const projectSlug =
    String(
      process.env.PORTAL_DEMO_INVOICE_PROJECT_SLUG ||
        DEFAULT_PROJECT_SLUG,
    ).trim();

  const client =
    await User.findOne({
      email: clientEmail,
    });

  if (!client) {
    throw new Error(
      `Demo client not found for ${clientEmail}. Run npm run seed:portal-demo first.`,
    );
  }

  const project =
    await Project.findOne({
      slug: projectSlug,
    });

  if (!project) {
    throw new Error(
      `Demo project not found for slug ${projectSlug}`,
    );
  }

  if (
    ![
      'demo',
      'concept',
    ].includes(
      project.projectClassification,
    )
  ) {
    throw new Error(
      `Project ${projectSlug} is not marked demo or concept`,
    );
  }

  if (
    project.client &&
    String(project.client) !==
      String(client._id)
  ) {
    throw new Error(
      `Project ${projectSlug} is already assigned to another client; refusing to reassign.`,
    );
  }

  if (!project.client) {
    project.client =
      client._id;

    await project.save();
  }

  const issueDate =
    new Date();

  const dueDate =
    new Date(issueDate);

  dueDate.setDate(
    dueDate.getDate() + 14,
  );

  const lineItems = [
    {
      description:
        'Demo website discovery and responsive design setup',

      quantity: 1,
      unitPrice: 950,
      amount: 950,
    },
    {
      description:
        'Portal-ready launch QA and handoff preparation',

      quantity: 1,
      unitPrice: 450,
      amount: 450,
    },
  ];

  const subtotal =
    lineItems.reduce(
      (sum, item) =>
        sum + item.amount,
      0,
    );

  const taxAmount =
    Number(
      (
        subtotal * 0.13
      ).toFixed(2),
    );

  const total =
    Number(
      (
        subtotal +
        taxAmount
      ).toFixed(2),
    );

  const patch = {
    project:
      project._id,

    client:
      client._id,

    kind:
      'advance',

    status:
      process.env.PORTAL_DEMO_INVOICE_STATUS ===
      'draft'
        ? 'draft'
        : 'sent',

    invoiceNumber:
      DEMO_INVOICE_NUMBER,

    title:
      'Sample MSPixelPulse demo project invoice',

    issueDate,
    dueDate,

    currency:
      'CAD',

    lineItems,

    subtotal,

    taxLabel:
      'HST sample',

    taxAmount,

    total,

    notes:
      'Demo/sample invoice for portal preview only. Not a real payable invoice.',

    isDemo:
      true,
  };

  let invoice =
    await Invoice.findOne({
      invoiceNumber:
        DEMO_INVOICE_NUMBER,
    });

  let action =
    'updated';

  if (!invoice) {
    invoice =
      await Invoice.create(
        patch,
      );

    action =
      'created';
  } else {
    Object.assign(
      invoice,
      patch,
    );

    await invoice.save();
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        provider: 'google',
        action,

        invoiceNumber:
          invoice.invoiceNumber,

        status:
          invoice.status,

        project:
          project.slug,

        client:
          client.email,
      },
      null,
      2,
    ),
  );
}

run().catch((error) => {
  console.error(
    error?.message ||
      'Demo invoice seed failed',
  );

  process.exitCode = 1;
});