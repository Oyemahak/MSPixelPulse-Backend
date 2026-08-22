import Lead from "../../../models/Lead.js";
import { cleanPublicUrl, cleanText, isValidEmail, normalizeEmail } from "../../../lib/validation.js";
import { deliverNotification } from "../../../lib/notificationService.js";
import { contactConfirmationEmail, contactNotificationEmail } from "../../../lib/emailTemplates.js";
import { emitPortalEvent, portalEventInternals } from "../../../lib/portalEvents.js";

const maxLengths = {
  inquiryType: 80,
  name: 120,
  email: 254,
  message: 12000,
  phone: 80,
  businessName: 180,
  service: 180,
  source: 120,
  sourceTitle: 200,
  sourceSlug: 200,
};

export async function createLead(req, res) {
  try {
    if (cleanText(req.body?._hp, 200)) return res.status(201).json({ ok: true });
    const payload = {
      inquiryType: cleanText(req.body?.inquiryType, maxLengths.inquiryType) || "Website Inquiry",
      name: cleanText(req.body?.name, maxLengths.name),
      email: normalizeEmail(req.body?.email),
      message: cleanText(req.body?.message, maxLengths.message),
      phone: cleanText(req.body?.phone, maxLengths.phone),
      businessName: cleanText(req.body?.businessName, maxLengths.businessName),
      service: cleanText(req.body?.service, maxLengths.service),
      source: cleanText(req.body?.source, maxLengths.source) || "public-contact",
      sourceTitle: cleanText(req.body?.sourceTitle, maxLengths.sourceTitle),
      sourceSlug: cleanText(req.body?.sourceSlug, maxLengths.sourceSlug),
      sourceUrl: cleanPublicUrl(req.body?.sourceUrl),
    };
    if (!payload.name || !isValidEmail(payload.email) || !payload.message) {
      return res.status(400).json({ error: "Name, a valid email, and a message are required." });
    }

    const duplicate = await Lead.findOne({
      email: payload.email,
      message: payload.message,
      source: payload.source,
      createdAt: { $gte: new Date(Date.now() - 5 * 60 * 1000) },
    });
    if (duplicate) {
      return res.status(200).json({
        ok: true,
        leadId: duplicate._id,
        duplicate: true,
        confirmationEmailStatus: duplicate.confirmationEmailStatus,
      });
    }

    const lead = await Lead.create({
      ...payload,
      ip: req.ip,
      ua: cleanText(req.get("user-agent"), 500),
    });
    const internalRecipients = [portalEventInternals.operationalRecipient()];
    const notificationPromise = deliverNotification({
      type: "contact_notification",
      relatedEntityType: "Lead",
      relatedEntityId: lead._id,
      recipients: internalRecipients,
      message: contactNotificationEmail(lead),
      dedupeKey: `contact:${lead._id}`,
      metadata: { source: lead.source, sourceTitle: lead.sourceTitle, sourceUrl: lead.sourceUrl },
    });
    const isInternalAddress = internalRecipients.includes(lead.email);
    const confirmationPromise = isInternalAddress
      ? Promise.resolve({ status: "skipped" })
      : deliverNotification({
        type: "contact_confirmation",
        relatedEntityType: "Lead",
        relatedEntityId: lead._id,
        recipients: [lead.email],
        message: contactConfirmationEmail(lead),
        dedupeKey: `contact-confirmation:${lead._id}`,
        metadata: { source: lead.source },
      });

    const [notificationLog, confirmationLog] = await Promise.all([notificationPromise, confirmationPromise]);
    lead.emailDeliveryStatus = notificationLog.status;
    lead.confirmationEmailStatus = confirmationLog.status;
    await lead.save();

    await emitPortalEvent({
      type: 'lead_created', category: 'leads', title: `New website lead - ${lead.businessName || lead.name}`,
      message: `${lead.inquiryType || 'Website inquiry'} was saved for Administrator review.`,
      relatedEntityType: 'Lead', relatedEntityId: String(lead._id), actionUrl: '/admin/leads',
      targets: { admins: true }, dedupeKey: `lead-in-app:${String(lead._id)}`,
      operationalEmail: false, metadata: { reference: String(lead._id) },
    });

    return res.status(201).json({
      ok: true,
      leadId: lead._id,
      emailDeliveryStatus: lead.emailDeliveryStatus,
      confirmationEmailStatus: lead.confirmationEmailStatus,
    });
  } catch (error) {
    console.error("[lead] createLead error:", error?.code || error?.name || "FAILED");
    return res.status(500).json({ error: "Failed to save the message. Please try again later." });
  }
}

export async function retryLeadNotification(lead, existingLog) {
  const isConfirmation = existingLog.notificationType === "contact_confirmation";
  return deliverNotification({
    type: existingLog.notificationType,
    relatedEntityType: "Lead",
    relatedEntityId: lead._id,
    recipients: isConfirmation ? [lead.email] : [portalEventInternals.operationalRecipient()],
    message: isConfirmation ? contactConfirmationEmail(lead) : contactNotificationEmail(lead),
    metadata: existingLog.metadata,
    existingLog,
  });
}
