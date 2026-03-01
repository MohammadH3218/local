# HandyCall Widget

Lightweight embeddable chat widget for business websites.

## Embed

```html
<script
  src="https://widget.handycall.org/v1/widget.js"
  data-company-id="YOUR_COMPANY_ID"
  data-api-base="https://api.handycall.org/api/v1"
  async
></script>
```

`data-api-base` is optional and defaults to `https://api.handycall.org/api/v1`.

## Backend endpoints used

- `GET /chat/widget/config/:companyId`
- `POST /chat/widget/session`
- `POST /chat/widget/message`
- `POST /chat/widget/callback`
