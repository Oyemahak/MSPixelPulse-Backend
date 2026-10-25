import { validateContact } from './aurelContactValidation.js';
import { mailerStatus, sendMail } from './mailer.js';
// Public contact endpoint for this exact agency concept. It cannot choose a recipient,
// sender, template, arbitrary upstream URL or attachment. Existing contact routes are untouched.
export function aurelContactHandler({fetchImpl=fetch,send=sendMail,status=mailerStatus,now=Date.now}={}) {
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  const b=req.body;
  const error=validateContact(b,now());if(error)return res.status(400).json({error});
  if(b.company_website)return res.status(200).json({ok:true});
  if(!status().configured)return res.status(503).json({error:'The contact service is temporarily unavailable. Email admin@mspixelpulse.com instead.'});
  try{
   const clientKey=/^[a-f0-9]{64}$/.test(req.get('x-aurel-client')??'')?req.get('x-aurel-client'):'unknown';
   const intake=await fetchImpl('https://mahakpatel.com/play/ai/api/intake/site/mspixelpulse-demo-immigration',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://immigration.mspixelpulse.com','User-Agent':'AUREL-Contact/'+clientKey},body:JSON.stringify({clientId:b.clientId,formType:'contact',name:b.name.trim(),email:b.email.trim(),phone:b.phone?.trim()||undefined,service:b.service,message:b.message.trim(),consent:true,pageUrl:'https://immigration.mspixelpulse.com/contact',company_website:''}),signal:AbortSignal.timeout(20000),redirect:'error'});
   if(!intake.ok)return res.status(intake.status===429?429:503).json({error:intake.status===429?'Too many requests. Please try again later or email admin@mspixelpulse.com.':'The contact service is temporarily unavailable. Please try again later or email admin@mspixelpulse.com.'});
   await send({to:['admin@mspixelpulse.com'],replyTo:b.email.trim(),idempotencyKey:'aurel-contact-'+b.clientId,subject:'[Northstead website inquiry] '+b.name.trim().replace(/[\r\n]/g,'').slice(0,80),text:['Northstead Immigration portfolio concept — MSPixelPulse website inquiry','',`Name: ${b.name.trim()}`,`Email: ${b.email.trim()}`,`Phone: ${b.phone?.trim()||'Not provided'}`,`Topic: ${b.service}`,'',b.message.trim(),'','The visitor consented to receive a reply. This is a website concept inquiry, not an immigration service request.',`Reference: ${b.clientId}`].join('\n')});
   return res.status(200).json({ok:true});
  }catch{return res.status(503).json({error:'We could not confirm email delivery. Your inquiry may have been saved. Retry once or email admin@mspixelpulse.com.'});}
 };
}
