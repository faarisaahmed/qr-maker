-- QR Studio dynamic links — Postgres / Neon schema.
-- Safe to run more than once.

create table if not exists links (
  id               text primary key,                 -- short code used in the URL
  target           text not null,                    -- where the code currently redirects
  edit_key_hash    text not null,                    -- sha256 of the owner's secret edit key
  creator_ip_hash  text,                             -- salted hash, only used for rate limiting
  disabled         boolean not null default false,   -- set by an admin or the safety check
  disabled_reason  text,
  scan_count       bigint not null default 0,
  last_scan_at     timestamptz,
  checked_at       timestamptz,                      -- last Safe Browsing check
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists links_creator_idx on links (creator_ip_hash, created_at);
create index if not exists links_checked_idx on links (checked_at nulls first) where not disabled;

create table if not exists scans (
  id        bigserial primary key,
  link_id   text not null references links (id) on delete cascade,
  at        timestamptz not null default now(),
  country   text,                                    -- 2-letter code from Cloudflare, no IPs stored
  device    text                                     -- ios | android | desktop | other
);
create index if not exists scans_link_at_idx on scans (link_id, at);
create index if not exists scans_at_idx on scans (at);

create table if not exists reports (
  id                bigserial primary key,
  link_id           text not null references links (id) on delete cascade,
  reason            text,
  reporter_ip_hash  text,
  resolved          boolean not null default false,
  created_at        timestamptz not null default now()
);
create index if not exists reports_open_idx on reports (resolved, created_at);
create index if not exists reports_reporter_idx on reports (reporter_ip_hash, created_at);
