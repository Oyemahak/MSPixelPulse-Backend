const SERVICES=new Set(['Website design for my practice','Study permits','Post-graduation work permits','Work permits','Permanent residence','Family sponsorship','Visitor visas','Canadian citizenship','Business immigration','Refusals & complex cases','Application & newcomer resources','General website inquiry']);
export function validateContact(body,now=Date.now()){
 if(!body||typeof body!=='object'||Array.isArray(body))return 'Invalid form data.';
 const limits={clientId:80,name:120,email:254,phone:40,service:100,message:3000,company_website:200};
 for(const [key,max] of Object.entries(limits))if(body[key]!==undefined&&(typeof body[key]!=='string'||body[key].length>max))return 'Please check the '+key+' field.';
 if(!/^[A-Za-z0-9_.:-]{8,80}$/.test(body.clientId??''))return 'Please refresh the page and try again.';
 if((body.name??'').trim().length<2)return 'Please enter your full name.';
 if(!/^[^\s@\r\n]+@[^\s@\r\n]+\.[^\s@\r\n]+$/.test(body.email??''))return 'Please enter a valid email address.';
 if(!SERVICES.has(body.service))return 'Please choose a service.';
 if((body.message??'').trim().length<10)return 'Please add a message of at least 10 characters.';
 if(body.consent!==true)return 'Privacy consent is required.';
 if(typeof body.startedAt!=='number'||now-body.startedAt<2000||now-body.startedAt>86400000)return 'Please take a moment to complete the form, or refresh the page.';
 return null;
}
