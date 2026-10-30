-- Admin-editable invoice address + contact footer overrides (plain text).
-- Blank values keep Triada brand defaults in wrap-invoice.

alter table public.invoice_docs
  add column if not exists address_line text not null default '',
  add column if not exists ops_email text not null default '',
  add column if not exists phones text not null default '';

comment on column public.invoice_docs.address_line is
  'Optional plain-text address footer override; blank uses brand Timisoara address.';
comment on column public.invoice_docs.ops_email is
  'Optional plain-text ops email footer override; blank uses brand ops email.';
comment on column public.invoice_docs.phones is
  'Optional plain-text phones footer override (e.g. “+40 … · +49 …”); blank uses brand phones.';

comment on table public.invoice_docs is
  'Admin plain-text editable Triada invoice/receipt content. Logo header and warm greeting defaults stay in wrap-invoice; address/contact footer may be overridden per invoice.';
