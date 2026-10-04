import { createHmac, timingSafeEqual } from 'node:crypto';
export const transitions = Object.freeze({ discovered: ['enriched', 'suppressed'], enriched: ['qualified', 'suppressed'], qualified: ['drafted', 'suppressed'], drafted: ['approved', 'suppressed'], approved: ['scheduled', 'suppressed'], scheduled: ['sent', 'suppressed'], sent: ['replied', 'suppressed'], replied: ['meeting', 'closed', 'suppressed'], meeting: ['closed', 'suppressed'], closed: ['suppressed'], suppressed: [] });
export function transition(lead, next, { sender, now = Date.now(), suppression = new Set() } = {}) {
  if (!transitions[lead.state]?.includes(next)) throw new Error('Invalid outbound transition');
  if (next !== 'suppressed' && (suppression.has(lead.email.toLowerCase()) || lead.optedOut)) throw new Error('Recipient suppressed');
  if (next === 'qualified' && (!lead.enrichmentVerified || !lead.intentEvidence || !lead.contactBasis)) throw new Error('Qualification evidence required');
  if (next === 'approved' && (!lead.reviewedBy || !lead.personalizationEvidence)) throw new Error('Personalization review required');
  if (next === 'scheduled' || next === 'sent') {
    if (!sender?.verified || !sender.dkimVerified || !sender.spfVerified || !sender.dmarcVerified || !sender.registrationName || !sender.postalAddress || !sender.replyTo || !sender.unsubscribeUrl?.startsWith('https://')) throw new Error('Verified sender identity required');
    if (!lead.sendAfter || Date.parse(lead.sendAfter) > now || !lead.recipientTimeZone || !lead.contactBasis) throw new Error('Delivery timing or contact basis missing');
  }
  return { ...lead, state: next, updatedAt: new Date(now).toISOString() };
}
export function optOutToken({ tenantId, leadId, expires }, key) {
  if (Buffer.byteLength(key ?? '') < 32 || !tenantId || !leadId || !Number.isInteger(expires)) throw new Error('Opt-out signing configuration invalid');
  const payload = Buffer.from(JSON.stringify({ tenantId, leadId, expires })).toString('base64url');
  return `${payload}.${createHmac('sha256', key).update(payload).digest('base64url')}`;
}
export function verifyOptOut(token, key, now = Date.now()) {
  if (typeof token !== 'string' || token.length > 2048 || Buffer.byteLength(key ?? '') < 32) throw new Error('Invalid opt-out token');
  const [payload, signature, excess] = token.split('.');
  if (!payload || !signature || excess) throw new Error('Malformed opt-out token');
  const actual = Buffer.from(signature, 'base64url'); const expected = createHmac('sha256', key).update(payload).digest();
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error('Invalid opt-out signature');
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  if (!claims.tenantId || !claims.leadId || !Number.isInteger(claims.expires) || claims.expires < now) throw new Error('Expired opt-out token');
  return claims;
}
export function classifyReply(text) {
  if (typeof text !== 'string' || text.length > 20000) throw new Error('Reply exceeds classifier boundary');
  if (/unsubscribe|remove me|stop emailing|do not contact/i.test(text)) return 'opt_out';
  if (/not interested|no thanks|not a fit/i.test(text)) return 'negative';
  if (/schedule|meeting|demo|interested|tell me more/i.test(text)) return 'positive_review_required';
  return 'human_review';
}
