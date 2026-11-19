export async function listCashAdvances(db:any,projectId:string):Promise<{rows:any[]}>{
 return db.query(`SELECT ca.id,ca.project_id,ca.requestor_id,ca.amount,ca.currency_id,c.code AS currency_code,
 ca.purpose,ca.advance_date,ca.approval_status,ca.disbursement_status,ca.expense_submission_status,
 ca.settled_status,ca.remaining_balance,ca.refund_amount,ca.created_at,ca.updated_at,u.email AS requestor_email
 FROM public.cash_advances ca LEFT JOIN public.currencies c ON c.id=ca.currency_id
 LEFT JOIN public.users u ON u.id=ca.requestor_id WHERE ca.project_id=$1::uuid
 ORDER BY ca.created_at DESC,ca.id DESC LIMIT 250`,[projectId]);
}
export async function createCashAdvance(db:any,input:{projectId:string;requestorId:string;amount:number;currencyId:string;purpose:string;advanceDate:string}):Promise<any>{
 const {rows}=await db.query(`INSERT INTO public.cash_advances(project_id,requestor_id,amount,currency_id,purpose,advance_date)
 VALUES($1::uuid,$2::uuid,$3::numeric,$4::uuid,$5::text,$6::date)
 RETURNING id,project_id,requestor_id,amount,currency_id,purpose,advance_date,approval_status,disbursement_status,
 expense_submission_status,settled_status,remaining_balance,refund_amount,created_at,updated_at`,
 [input.projectId,input.requestorId,input.amount,input.currencyId,input.purpose,input.advanceDate]);
 return rows[0]??null;
}
export async function decideCashAdvance(db:any,input:{id:string;projectId:string;actorId:string;decision:"approved"|"rejected"}):Promise<any>{
 const {rows}=await db.query(`UPDATE public.cash_advances SET approval_status=$4::text
 WHERE id=$1::uuid AND project_id=$2::uuid AND requestor_id<>$3::uuid AND approval_status IN('draft','pending')
 RETURNING id,project_id,requestor_id,amount,currency_id,purpose,advance_date,approval_status,disbursement_status,
 expense_submission_status,settled_status,remaining_balance,refund_amount,created_at,updated_at`,
 [input.id,input.projectId,input.actorId,input.decision]);
 return rows[0]??null;
}
