import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { setCorrelationContext, withRequestLogging } from "../shared/logger.js";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ses = new SESClient({});

const MERCHANTS = process.env.MERCHANTS_TABLE!;
const CASES = process.env.CASES_TABLE!;
const SES_FROM = process.env.SES_FROM!;
const SES_DEFAULT_TO = process.env.SES_DEFAULT_TO || '';

const OPEN = new Set(['needs_response','warning_needs_response','under_review','warning_under_review']);

export const handler = withRequestLogging(async () => {
  setCorrelationContext({ merchantId: 'system' });
  const merchants = await ddb.send(new ScanCommand({ TableName: MERCHANTS }));
  const ms = (merchants.Items||[]).map(i => (i.stripe_account_id || i.merchant_id)).filter(Boolean);
  const since = Math.floor((Date.now() - 7*24*3600*1000)/1000);

  for (const m of ms) {
    setCorrelationContext({ merchantId: String(m) });
    const pk = `MERCHANT#${m}`;
    const r = await ddb.send(new QueryCommand({ TableName: CASES, KeyConditionExpression: "pk = :pk", ExpressionAttributeValues: { ":pk": pk } }));
    const items = r.Items||[];

    const byStatus: Record<string, number> = {};
    let openAmt=0, wonAmt=0, newThisWeek=0, decidedThisWeek=0;
    const nearest = items.filter(i => i.due_by_epoch).sort((a,b)=>a.due_by_epoch-b.due_by_epoch).slice(0,5);

    for(const it of items){
      byStatus[it.status] = (byStatus[it.status]||0)+1;
      if(OPEN.has(it.status)) openAmt += (it.amount_cents||0);
      if(it.status==='won' && (it.updated_at_epoch||0) >= since) wonAmt += (it.amount_cents||0);
      if((it.created_at_epoch||0) >= since) newThisWeek++;
      if((it.result_at_epoch||0) >= since) decidedThisWeek++;
    }

    const to = SES_DEFAULT_TO;
    if(!to || !SES_FROM) continue;

    const html = `
      <div style="font-family:ui-sans-serif,system-ui">
        <h2 style="margin:0 0 8px">Weekly Dispute Digest</h2>
        <p style="color:#555">Account: <b>${m}</b></p>
        <ul>
          <li>Open amount: <b>${(openAmt/100).toFixed(2)}</b></li>
          <li>Won this week: <b>${(wonAmt/100).toFixed(2)}</b></li>
          <li>New disputes (7d): <b>${newThisWeek}</b></li>
          <li>Decisions (7d): <b>${decidedThisWeek}</b></li>
        </ul>
        <h4>Status breakdown</h4>
        <pre>${JSON.stringify(byStatus,null,2)}</pre>
        <h4>Nearest due</h4>
        <ol>${nearest.map(n=>`<li>${n.dispute_id} — due ${(n.due_by_epoch)? new Date(n.due_by_epoch*1000).toISOString().slice(0,10):'-'} — ${(n.amount_cents/100).toFixed(2)} ${n.currency}</li>`).join('')}</ol>
        <p style="margin-top:24px">Open Cases UI: /cases (enter acct ID)</p>
      </div>
    `;

    await ses.send(new SendEmailCommand({
      Source: SES_FROM,
      Destination: { ToAddresses: [to] },
      Message: { Subject: { Data: "Weekly Dispute Digest" }, Body: { Html: { Data: html } } }
    }));
  }

  return { ok:true };
});
