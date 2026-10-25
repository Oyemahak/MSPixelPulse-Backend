import 'dotenv/config';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {dataProviderName} from '../config/providers.js';
import Project from '../models/Project.js';
import {aurelImmigrationProject as incoming} from '../data/aurelImmigrationProject.js';
const apply=process.argv.includes('--apply');
if(dataProviderName()!=='google')throw new Error('Use the existing Google data provider.');
const existing=await Project.findOne({$or:[{slug:incoming.slug},{repositoryFullName:incoming.repositoryFullName}]});
if(existing?.repositoryFullName&&existing.repositoryFullName!==incoming.repositoryFullName)throw new Error('Project identity conflict; no write performed.');
let action=existing?'preserve-existing':'create';
if(apply&&!existing){
 const directory=process.argv.find(a=>a.startsWith('--backup-dir='))?.slice(13);
 if(!directory?.startsWith('/')||resolve(directory).startsWith(resolve('.')+'/'))throw new Error('An absolute private backup directory outside this repository is required.');
 await mkdir(directory,{recursive:true,mode:0o700});
 await writeFile(resolve(directory,'aurel-project-before.json'),JSON.stringify({slug:incoming.slug,before:null}),{mode:0o600});
 const check=await fetch(incoming.liveUrl,{signal:AbortSignal.timeout(15000)});if(!check.ok||!check.headers.get('content-type')?.includes('text/html'))throw new Error('Live website must pass HTTPS verification before publication.');
 const created=await Project.create(incoming);console.log(JSON.stringify({applied:true,action,id:String(created._id),slug:created.slug,published:created.published}));
}else console.log(JSON.stringify({applied:false,action,slug:incoming.slug,id:existing?String(existing._id):null,published:existing?.published??false}));
