// A small export in Jira's CSV format, with its usual quirks: repeated
// Component/s, Labels, and link columns; a "Custom field (…)" header; a
// multi-line quoted description; an epic that is the parent of stories by
// issue ID; a link to an issue outside the export; and a row with no summary.
export const JIRA_EXPORT = [
  'Summary,Issue key,Issue id,Issue Type,Status,Project name,Priority,Component/s,Component/s,Fix Version/s,Labels,Labels,Custom field (Story Points),Parent,Custom field (Team),Description,Outward issue link (Blocks),Inward issue link (Blocks)',
  'Self-serve SSO setup,PAY-1,10001,Epic,To Do,Payments,High,SSO,,2027.1,identity,,13,,Platform,"Let admins set up SSO without a ticket.",,',
  'SAML metadata upload,PAY-2,10002,Story,In Progress,Payments,Medium,SSO,,2027.1,identity,enterprise,3,10001,Platform,"Upload a metadata XML file.\nValidate it first.",PAY-3,',
  'SSO test connection,PAY-3,10003,Story,To Do,Payments,Medium,SSO,Admin Console,2027.2,,,5,10001,Growth,,,PAY-2',
  'Invoice PDF redesign,PAY-4,10004,Story,Done,Payments,Low,Invoicing,,2027.2,,,8,,Growth,,OPS-9,',
  ',PAY-5,10005,Bug,To Do,Payments,Low,,,,,,,,,,,',
  'Usage-based pricing spike,PAY-6,10006,Spike,To Do,Payments,Low,,,,research,,1,PAY-99,,,,',
].join('\n');
