import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const root=process.cwd();
const manifestPath=path.join(root,"migration_release_manifest_p20_pm_appointment_first_113.json");
const manifest=JSON.parse(fs.readFileSync(manifestPath,"utf8"));
const migration=manifest.migrations?.[0];
const filePath=path.join(root,"migrations",migration?.filename||"");
const fail=(message)=>{console.error("BLOCKED: "+message);process.exit(1);};
if(manifest.purpose!=="prepared_p20_pm_appointment_first_release_package_owner_approval_required") fail("Purpose mismatch.");
if(manifest.production_application!=="not_authorized") fail("Production application must remain unauthorized.");
if(manifest.uat_application?.status!=="not_applied"||manifest.owner_approval?.status!=="pending") fail("UAT or approval status must remain pending.");
if(manifest.migrations?.length!==1||migration?.migration_number!==113||migration?.status!=="prepared"||migration?.application_status!=="not_applied"||migration?.source_sha_verified!==true) fail("Migration release entry is not in prepared state.");
if(!fs.existsSync(filePath)) fail("Migration SQL file is missing.");
const actual=crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
if(actual!==migration.sha256) fail(`Migration 113 SHA-256 mismatch. Expected ${migration.sha256}; actual ${actual}.`);
const sql=fs.readFileSync(filePath,"utf8");
function lexicalSqlCheck(source){
  let state="normal",dollarTag="",depth=0,line=1;
  for(let i=0;i<source.length;i++){
    const ch=source[i],next=source[i+1];
    if(ch==="\\n") line++;
    if(state==="normal"){
      if(ch==="-"&&next==="-"){state="line";i++;continue;}
      if(ch==="/"&&next==="*"){state="block";i++;continue;}
      if(ch==="'"){state="single";continue;}
      if(ch==='"'){state="double";continue;}
      if(ch==="$"){
        const match=source.slice(i).match(/^\\$[A-Za-z_0-9]*\\$/);
        if(match){dollarTag=match[0];state="dollar";i+=dollarTag.length-1;continue;}
      }
      if(ch==="(")depth++;
      if(ch===")"){depth--;if(depth<0)fail("SQL has unmatched closing parenthesis at line "+line);}
    }else if(state==="single"){
      if(ch==="'"&&next==="'"){i++;continue;}
      if(ch==="'")state="normal";
    }else if(state==="double"){
      if(ch==='"'&&next==='"'){i++;continue;}
      if(ch==='"')state="normal";
    }else if(state==="line"){if(ch==="\\n")state="normal";}
    else if(state==="block"){if(ch==="*"&&next==="/"){i++;state="normal";}}
    else if(state==="dollar"){if(source.startsWith(dollarTag,i)){i+=dollarTag.length-1;state="normal";}}
  }
  if(state!=="normal")fail("SQL lexical state is unclosed: "+state);
  if(depth!==0)fail("SQL parentheses are unbalanced: "+depth);
}
lexicalSqlCheck(sql);
if((sql.match(/^BEGIN;\s*$/gim)||[]).length!==1||(sql.match(/^COMMIT;\s*$/gim)||[]).length!==1) fail("Migration must have one BEGIN/COMMIT boundary.");
if(/^\s*(DROP\s+TABLE|DROP\s+SCHEMA|TRUNCATE)\b/im.test(sql)) fail("Unexpected destructive DDL detected.");
console.log("PASS: Migration 113 SHA-256 verified and remains prepared/not applied.");
