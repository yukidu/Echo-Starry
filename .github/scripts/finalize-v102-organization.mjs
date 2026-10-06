import { readFileSync, writeFileSync } from 'node:fs';

function replaceOnce(source, search, replacement, label) {
  if (!source.includes(search)) throw new Error(`Missing source for ${label}`);
  return source.replace(search, replacement);
}

const modelPath='worker/organizationModel.ts';
let model=readFileSync(modelPath,'utf8');
model=replaceOnce(model,
`    if (summary && summary.members.length >= 2 && !summary.members.some((member:any)=>member.id===actorId && member.id===partnerId)) {
      const ids = summary.members.map((member:any)=>member.id);
      if (!(ids.includes(actorId) && ids.includes(partnerId))) return { error: '共同事業體已經有兩位成員', status: 409 } as const;
    }`,
`    if (summary && summary.members.length >= 2) {
      const ids = summary.members.map((member:any)=>member.id);
      if (!(ids.includes(actorId) && ids.includes(partnerId))) return { error: '共同事業體已經有兩位成員', status: 409 } as const;
    }`,
'couple capacity guard');
model=replaceOnce(model,
`  const existingMembers = await groupMembers(db, groupId!);
  const existingIds = existingMembers.map((row:any)=>row.id);
  const orderedIds = [...existingIds, actorId, partnerId].filter((id,index,array)=>array.indexOf(id)===index).slice(0,2);`,
`  const existingMembers = await groupMembers(db, groupId!);
  const existingIds = existingMembers.map((row:any)=>row.id);
  // Keep A&B stable: preserve an existing organization member first; otherwise use dealer-id registration order.
  const orderedIds = existingIds.length
    ? [...existingIds, actorId, partnerId].filter((id,index,array)=>array.indexOf(id)===index).slice(0,2)
    : rows.map((row:any)=>String(row.id)).slice(0,2);`,
'stable A&B order');
writeFileSync(modelPath,model);

const schemaPath='schema.sql';
let schema=readFileSync(schemaPath,'utf8');
if (!schema.includes('CREATE TABLE IF NOT EXISTS organization_groups')) {
  schema += `\n\n-- v102 canonical shared-business organization. Personal member data remains independent.\nCREATE TABLE IF NOT EXISTS organization_groups (\n  id TEXT PRIMARY KEY,\n  dealerId TEXT NOT NULL UNIQUE,\n  createdAt INTEGER NOT NULL,\n  updatedAt INTEGER NOT NULL\n);\nCREATE TABLE IF NOT EXISTS organization_members (\n  groupId TEXT NOT NULL,\n  userId TEXT NOT NULL UNIQUE,\n  memberOrder INTEGER NOT NULL DEFAULT 0,\n  joinedAt INTEGER NOT NULL,\n  PRIMARY KEY(groupId,userId)\n);\nCREATE INDEX IF NOT EXISTS organization_members_group ON organization_members(groupId,memberOrder);\nCREATE TABLE IF NOT EXISTS upline_bindings (\n  memberId TEXT NOT NULL,\n  kind TEXT NOT NULL,\n  groupId TEXT NOT NULL,\n  createdAt INTEGER NOT NULL,\n  updatedAt INTEGER NOT NULL,\n  PRIMARY KEY(memberId,kind)\n);\nCREATE INDEX IF NOT EXISTS upline_bindings_group ON upline_bindings(groupId,kind);\n`;
}
writeFileSync(schemaPath,schema);
console.log('Stable organization ordering and schema source applied');
