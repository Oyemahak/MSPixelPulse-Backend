import { brandedEmail } from "./mailer.js";

const siteUrl = String(process.env.PUBLIC_SITE_URL || "https://mspixelpulse.com").replace(/\/+$/, "");

export function contactNotificationEmail(lead) {
  return {
    subject: `${lead.inquiryType || "Website inquiry"}: ${lead.name}`,
    replyTo: `${lead.name} <${lead.email}>`,
    ...brandedEmail({
      eyebrow: "New website inquiry",
      heading: lead.inquiryType || "Website inquiry",
      intro: "A new lead was saved in the MSPixelPulse admin workspace.",
      rows: [
        { label: "Lead ID", value: lead._id },
        { label: "Name", value: lead.name },
        { label: "Email", value: lead.email },
        { label: "Phone", value: lead.phone || "Not provided" },
        { label: "Business", value: lead.businessName || "Not provided" },
        { label: "Service", value: lead.service || "Not specified" },
        { label: "Source", value: lead.source || "Not specified" },
        { label: "Page", value: lead.sourceTitle || "Not specified" },
        { label: "Page URL", value: lead.sourceUrl || "Not specified" },
        { label: "Message", value: lead.message },
        { label: "Submitted", value: lead.createdAt?.toISOString?.() || new Date().toISOString() },
      ],
      button: { label: "Review saved lead", url: `${siteUrl}/admin/blog-engagement?tab=leads&lead=${lead._id}` },
    }),
  };
}

export function contactConfirmationEmail(lead) {
  return {
    subject: "We received your message — MSPixelPulse",
    ...brandedEmail({
      eyebrow: "MSPixelPulse",
      heading: `Thanks for reaching out, ${lead.name}`,
      intro: "Your message has been received. We will review the details and follow up using the contact information you provided.",
      rows: [
        { label: "Request", value: lead.inquiryType || "Website inquiry" },
        { label: "Summary", value: lead.message },
      ],
      button: { label: "Visit MSPixelPulse", url: siteUrl },
      footer: "This confirmation was sent because this address was used to contact MSPixelPulse. Please do not reply with passwords or private credentials.",
    }),
  };
}

export function reactionNotificationEmail(details) {
  return {
    subject: `${details.action}: ${details.blogTitle}`,
    ...brandedEmail({
      eyebrow: "Blog engagement",
      heading: `${details.action} recorded`,
      intro: "The blog reaction was saved successfully. Email delivery does not control the reaction result.",
      rows: [
        { label: "Article", value: details.blogTitle },
        { label: "Action", value: details.action },
        { label: "Likes", value: details.likes },
        { label: "Dislikes", value: details.dislikes },
        { label: "Recorded", value: details.recordedAt },
      ],
      button: { label: "Open article", url: details.blogUrl },
    }),
  };
}

export function commentNotificationEmail(comment) {
  return {
    subject: `Comment awaiting moderation: ${comment.blogTitle}`,
    replyTo: `${comment.name} <${comment.email}>`,
    ...brandedEmail({
      eyebrow: "Blog comment",
      heading: "A comment is awaiting moderation",
      intro: "This comment is pending and is not public until an administrator approves it.",
      rows: [
        { label: "Article", value: comment.blogTitle },
        { label: "Name", value: comment.name },
        { label: "Email", value: comment.email },
        { label: "Comment", value: comment.comment },
        { label: "Status", value: comment.status },
        { label: "Submitted", value: comment.createdAt?.toISOString?.() || new Date().toISOString() },
      ],
      button: { label: "Review comment", url: `${siteUrl}/admin/blog-engagement?tab=comments&comment=${comment._id}` },
    }),
  };
}

export function shareNotificationEmail(share, shareCount) {
  return {
    subject: `Blog share recorded: ${share.blogTitle}`,
    ...brandedEmail({
      eyebrow: "Blog engagement",
      heading: "A share action was recorded",
      rows: [
        { label: "Article", value: share.blogTitle },
        { label: "Platform", value: share.platform },
        { label: "Event", value: share.eventType },
        { label: "Total shares", value: shareCount },
        { label: "Recorded", value: share.createdAt?.toISOString?.() || new Date().toISOString() },
      ],
      button: { label: "Open article", url: share.blogUrl },
    }),
  };
}

export function subscriptionNotificationEmail(subscriber, eventLabel) {
  return {
    subject: `Blog subscription ${eventLabel}: ${subscriber.email}`,
    ...brandedEmail({
      eyebrow: "Blog subscription",
      heading: `Subscription ${eventLabel}`,
      rows: [
        { label: "Subscriber", value: subscriber.email },
        { label: "Status", value: subscriber.status },
        { label: "Source article", value: subscriber.sourceBlogTitle },
        { label: "Article URL", value: subscriber.sourceBlogUrl },
        { label: "Recorded", value: subscriber.updatedAt?.toISOString?.() || new Date().toISOString() },
      ],
      button: { label: "Review subscribers", url: `${siteUrl}/admin/blog-engagement?tab=subscribers` },
    }),
  };
}

export function subscriptionConfirmationEmail(subscriber, confirmationToken, unsubscribeToken) {
  const confirmUrl = `${siteUrl}/blog/subscription/confirm?token=${encodeURIComponent(confirmationToken)}`;
  const unsubscribeUrl = `${siteUrl}/blog/subscription/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`;
  return {
    subject: "Confirm your MSPixelPulse blog subscription",
    ...brandedEmail({
      eyebrow: "MSPixelPulse insights",
      heading: "Confirm your email subscription",
      intro: "Confirm your address to receive practical website, UX, SEO, development, and small-business growth insights from MSPixelPulse.",
      rows: [{ label: "Subscribed from", value: subscriber.sourceBlogTitle }],
      button: { label: "Confirm subscription", url: confirmUrl },
      footer: `If you did not request this, no action is needed. You can also unsubscribe here: ${unsubscribeUrl}. Privacy: ${siteUrl}/privacy`,
    }),
  };
}
