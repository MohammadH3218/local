type EmailCta = {
  label: string;
  url: string;
};

type HandycallEmailInput = {
  title: string;
  preheader?: string;
  greeting?: string;
  body: string;
  cta?: EmailCta;
  footer?: string;
  brandName?: string;
  logoUrl?: string;
};

export function renderHandycallEmail(input: HandycallEmailInput): string {
  const brand = input.brandName || 'HandyCall';
  const logoUrl = input.logoUrl || 'https://handycall.org/images/logo-words.png';
  const preheader = input.preheader || '';
  const greeting = input.greeting ? `<p style="margin:0 0 16px;font-size:16px;line-height:24px;color:#0f172a;">${input.greeting}</p>` : '';
  const footer = input.footer
    ? `<p style="margin:24px 0 0;font-size:12px;line-height:18px;color:#64748b;">${input.footer}</p>`
    : '';
  const cta = input.cta
    ? `<div style="margin:24px 0 8px;">
         <a href="${input.cta.url}" style="background:#0f9d58;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:999px;font-weight:600;display:inline-block;">${input.cta.label}</a>
       </div>`
    : '';

  return `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${input.title}</title>
  </head>
  <body style="margin:0;padding:0;background:#f8fafc;font-family:Inter,Segoe UI,Arial,sans-serif;color:#0f172a;">
    <div style="display:none;max-height:0;overflow:hidden;color:#f8fafc;opacity:0;">${preheader}</div>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;background:#ffffff;border-radius:20px;box-shadow:0 12px 30px rgba(15,23,42,0.08);overflow:hidden;">
            <tr>
              <td style="padding:32px 32px 0;">
                <img src="${logoUrl}" alt="${brand}" width="140" style="display:block;border:0;max-width:140px;" />
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 32px;">
                <h1 style="margin:0 0 12px;font-size:24px;line-height:32px;color:#0f172a;">${input.title}</h1>
                ${greeting}
                <div style="font-size:15px;line-height:24px;color:#334155;">${input.body}</div>
                ${cta}
                ${footer}
              </td>
            </tr>
          </table>
          <p style="margin:16px 0 0;font-size:12px;color:#94a3b8;">${brand} - Automated email from HandyCall</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
