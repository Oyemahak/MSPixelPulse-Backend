import 'dotenv/config';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {dataProviderName} from '../config/providers.js';
import Project from '../models/Project.js';
import {aurelImmigrationProject as incoming} from '../data/aurelImmigrationProject.js';
import {brandUpdateFor} from '../lib/projectBrandUpdate.js';
const apply=process.argv.includes('--apply');
const updateBrand=process.argv.includes('--update-brand');
const argValue=name=>process.argv.find(a=>a.startsWith(`--${name}=`))?.slice(name.length+3)||'';
async function backupDirectory(){
 const directory=argValue('backup-dir');
 if(!directory?.startsWith('/')||resolve(directory).startsWith(resolve('.')+'/'))throw new Error('An absolute private backup directory outside this repository is required.');
 await mkdir(directory,{recursive:true,mode:0o700});
 return directory;
}
if(dataProviderName()!=='google')throw new Error('Use the existing Google data provider.');
if(updateBrand){
 // Brand refresh for the EXISTING record only (matched by slug and repositoryFullName). Dry run
 // unless --apply; with --apply a before-snapshot is written first. Never creates a record and
 // changes only the brand fields listed in src/lib/projectBrandUpdate.js (+ --thumbnail=https://…).
 const existing=await Project.findOne({slug:incoming.slug});
 const thumbnail=argValue('thumbnail');
 const changes=brandUpdateFor(existing,incoming,{thumbnail});
 const fields=Object.keys(changes);
 const id=String(existing._id);
 if(!apply||!fields.length){
  console.log(JSON.stringify({applied:false,action:fields.length?'update-brand-preview':'brand-current',id,slug:existing.slug,fields,changes},null,1));
 }else{
  const directory=await backupDirectory();
  const before=typeof existing.toObject==='function'?existing.toObject():existing;
  await writeFile(resolve(directory,`aurel-project-brand-before-${Date.now()}.json`),JSON.stringify({id,slug:existing.slug,before}),{mode:0o600});
  const updated=await Project.findByIdAndUpdate(existing._id,{$set:changes},{new:true,runValidators:true});
  console.log(JSON.stringify({applied:true,action:'update-brand',id:String(updated._id),slug:updated.slug,fields,title:updated.title,remaining:Object.keys(brandUpdateFor(updated,incoming,{thumbnail}))}));
 }
}else{
 const existing=await Project.findOne({$or:[{slug:incoming.slug},{repositoryFullName:incoming.repositoryFullName}]});
 if(existing?.repositoryFullName&&existing.repositoryFullName!==incoming.repositoryFullName)throw new Error('Project identity conflict; no write performed.');
 let action=existing?'preserve-existing':'create';
 if(apply&&!existing){
  const directory=await backupDirectory();
  await writeFile(resolve(directory,'aurel-project-before.json'),JSON.stringify({slug:incoming.slug,before:null}),{mode:0o600});
  const check=await fetch(incoming.liveUrl,{signal:AbortSignal.timeout(15000)});if(!check.ok||!check.headers.get('content-type')?.includes('text/html'))throw new Error('Live website must pass HTTPS verification before publication.');
  const created=await Project.create(incoming);console.log(JSON.stringify({applied:true,action,id:String(created._id),slug:created.slug,published:created.published}));
 }else console.log(JSON.stringify({applied:false,action,slug:incoming.slug,id:existing?String(existing._id):null,published:existing?.published??false}));
}
